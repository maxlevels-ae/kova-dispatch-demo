const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const dev = process.env.NODE_ENV !== "production";
// Listen on all interfaces, but advertise a real hostname — redirects built
// from "0.0.0.0" break geolocation (not a secure context in browsers).
const bindHost = process.env.BIND_HOST || "0.0.0.0";
const hostname =
  process.env.HOSTNAME && process.env.HOSTNAME !== "0.0.0.0"
    ? process.env.HOSTNAME
    : "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// ─── H3 helpers (CommonJS — server.js is not bundled by Next) ───────────────
// Key layout MUST match src/lib/services/h3-redis.js:
//   h3:drivers:{cell}          SET of driver profile ids
//   h3:driver:cell:{profileId} STRING current cell
//   driver:loc:{profileId}     HASH { lat, lng, heading, ts, h3, flushed }
let h3;
try {
  h3 = require("h3-js");
} catch {
  console.warn(
    "⚠️  h3-js not installed — H3 spatial features disabled in sockets",
  );
  h3 = null;
}

const H3_RESOLUTION = 9;
const DRIVER_CELL_TTL = 300;
const LOC_TTL = 600;

function getH3Cell(lat, lng) {
  if (!h3) return null;
  try {
    return h3.latLngToCell(lat, lng, H3_RESOLUTION);
  } catch {
    return null;
  }
}

// ─── Redis (lazy) ────────────────────────────────────────────────────────────
let redisClient = null;

async function getRedis() {
  if (redisClient) return redisClient;
  try {
    const Redis = require("ioredis");
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });
    redisClient.on("error", () => {}); // logged once below instead of per-op
    await redisClient.connect();
    console.log("✅ Redis connected (socket server)");
    return redisClient;
  } catch (err) {
    console.warn("⚠️  Redis unavailable for socket server:", err.message);
    redisClient = null;
    return null;
  }
}

/** Update driver's position: H3 index + location hash. Redis-only (fast path). */
async function updateDriverLocation(profileId, lat, lng, heading) {
  const redis = await getRedis();
  if (!redis) return null;

  const newCell = getH3Cell(lat, lng);
  const cellKey = `h3:driver:cell:${profileId}`;

  try {
    const pipe = redis.pipeline();

    if (newCell) {
      const oldCell = await redis.get(cellKey);
      if (oldCell && oldCell !== newCell) {
        pipe.srem(`h3:drivers:${oldCell}`, profileId);
      }
      pipe.sadd(`h3:drivers:${newCell}`, profileId);
      pipe.expire(`h3:drivers:${newCell}`, DRIVER_CELL_TTL);
      pipe.set(cellKey, newCell, "EX", DRIVER_CELL_TTL);
    }

    pipe.hset(`driver:loc:${profileId}`, {
      lat: String(lat),
      lng: String(lng),
      heading: String(heading ?? ""),
      ts: String(Date.now()),
      h3: newCell || "",
      flushed: "0",
    });
    pipe.expire(`driver:loc:${profileId}`, LOC_TTL);

    await pipe.exec();
    return newCell;
  } catch (err) {
    console.error("[Socket] location update failed:", err.message);
    return null;
  }
}

async function removeDriverFromIndex(profileId) {
  const redis = await getRedis();
  if (!redis) return;
  try {
    const cellKey = `h3:driver:cell:${profileId}`;
    const cell = await redis.get(cellKey);
    const pipe = redis.pipeline();
    if (cell) pipe.srem(`h3:drivers:${cell}`, profileId);
    pipe.del(cellKey);
    pipe.del(`driver:loc:${profileId}`);
    await pipe.exec();
  } catch (err) {
    console.error("[Socket] index remove failed:", err.message);
  }
}

/** Is this user a participant of the ride? (set by ride-service in Redis) */
async function isRideMember(rideId, userId) {
  const redis = await getRedis();
  if (!redis) return false; // Never grant private ride access without authorization.
  try {
    const member = await redis.sismember(
      `ride:members:${rideId}`,
      String(userId),
    );
    return member === 1;
  } catch {
    return false;
  }
}

// Native read-only authorization lookup shared by socket handshakes and GPS relays.
let socketDbPromise;
async function socketDB() {
  if (!socketDbPromise) {
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    socketDbPromise = client
      .connect()
      .then((c) => c.db())
      .catch((e) => {
        socketDbPromise = null;
        throw e;
      });
  }
  return socketDbPromise;
}
async function currentSocketUser(id, role) {
  const { ObjectId } = require("mongodb");
  return (await socketDB())
    .collection("users")
    .findOne(
      { _id: new ObjectId(id), role, isActive: true },
      { projection: { name: 1 } },
    );
}
app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // next.config's poweredByHeader doesn't apply through a custom server
    res.removeHeader?.("X-Powered-By");
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) =>
      String(name).toLowerCase() === "x-powered-by"
        ? res
        : setHeader(name, value);
    return handler(req, res);
  });

  const io = new Server(httpServer, {
    cors: {
      // Same-origin in practice; dev stays permissive for flexible ports
      origin: dev ? true : process.env.NEXT_PUBLIC_APP_URL || true,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // API routes and services emit through this
  global.io = io;

  const riderNs = io.of("/rider");
  const driverNs = io.of("/driver");
  const adminNs = io.of("/admin");

  // ─── JWT authentication ────────────────────────────────
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("❌ NEXTAUTH_SECRET is required for socket auth");
    process.exit(1);
  }

  const authenticate = (requiredRole) => async (socket, nextFn) => {
    const token = socket.handshake.auth?.token;
    if (!token) return nextFn(new Error("Authentication required"));

    try {
      const payload = jwt.verify(token, secret);
      if (requiredRole && payload.role !== requiredRole) {
        return nextFn(new Error("Wrong namespace for role"));
      }
      if (!(await currentSocketUser(payload.sub, payload.role)))
        return nextFn(new Error("Authorization revoked"));
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      socket.userName = payload.name || "";
      socket.profileId = payload.profileId || null; // drivers only
      nextFn();
    } catch {
      nextFn(new Error("Invalid or expired token"));
    }
  };

  riderNs.use(authenticate("rider"));
  driverNs.use(authenticate("driver"));
  adminNs.use(authenticate("admin"));

  // ─── Driver namespace ──────────────────────────────────
  driverNs.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);

    // Rejoin an active ride room after reconnect
    socket.on("ride:subscribe", async ({ rideId } = {}) => {
      if (!rideId) return;
      if (await isRideMember(rideId, socket.userId)) {
        socket.join(`ride:${rideId}`);
      }
    });

    // High-frequency GPS pings → Redis + relays. Mongo writes happen
    // in the location flusher, not here.
    socket.on("driver:location", async (data = {}) => {
      const { lat, lng, heading, speed, rideId } = data;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180 ||
        !socket.profileId
      )
        return;
      try {
        const { ObjectId } = require("mongodb");
        const user = await currentSocketUser(socket.userId, "driver");
        const driver = await (
          await socketDB()
        )
          .collection("drivers")
          .findOne(
            {
              _id: new ObjectId(socket.profileId),
              userId: new ObjectId(socket.userId),
              isOnline: true,
              isApproved: true,
            },
            { projection: { vehicle: 1, currentRideId: 1 } },
          );
        if (!user || !driver) return;
        await updateDriverLocation(socket.profileId, lat, lng, heading);
        const payload = {
          driverProfileId: socket.profileId,
          location: { lat, lng },
          heading: heading ?? null,
          speed: speed ?? null,
          timestamp: Date.now(),
        };
        if (rideId && (await isRideMember(rideId, socket.userId)))
          riderNs
            .to("ride:" + rideId)
            .emit("driver:location", { ...payload, rideId });
        adminNs.emit("driver:location", {
          ...payload,
          name: user.name,
          vehicle: driver.vehicle,
          status: driver.currentRideId ? "on_trip" : "available",
        });
      } catch {
        /* Fail closed; next GPS ping retries. */
      }
    });

    // Going offline cleanly (state change itself goes through the API)
    socket.on("driver:offline", async () => {
      if (socket.profileId) await removeDriverFromIndex(socket.profileId);
    });

    socket.on("disconnect", async () => {
      if (
        socket.profileId &&
        ![...driverNs.sockets.values()].some(
          (s) => s.profileId === socket.profileId,
        )
      ) {
        await removeDriverFromIndex(socket.profileId);
        adminNs.emit("driver:status-changed", {
          driverProfileId: socket.profileId,
          online: false,
          timestamp: Date.now(),
        });
      }
    });
  });

  // ─── Rider namespace ───────────────────────────────────
  riderNs.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on("ride:subscribe", async ({ rideId } = {}) => {
      if (!rideId) return;
      if (await isRideMember(rideId, socket.userId)) {
        socket.join(`ride:${rideId}`);
      }
    });
  });

  // ─── Admin namespace ───────────────────────────────────
  adminNs.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);
    const timer = setInterval(async () => {
      try {
        if (!(await currentSocketUser(socket.userId, "admin")))
          socket.disconnect(true);
      } catch {
        socket.disconnect(true);
      }
    }, 15000);
    socket.on("disconnect", () => clearInterval(timer));
  });

  // ─── Start server ─────────────────────────────────────
  httpServer
    .once("error", (err) => {
      console.error("Server error:", err);
      process.exit(1);
    })
    .listen(port, bindHost, () => {
      console.log(
        `\n🚀 Maxride running at http://${hostname}:${port}  (H3: ${h3 ? "on" : "off"})\n`,
      );
    });
});
