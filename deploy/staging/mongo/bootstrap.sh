#!/usr/bin/env bash
set -euo pipefail
: "${STAGING_MONGO_PASSWORD:?staging password required}"
: "${STAGING_MONGO_ADMIN_PASSWORD:?staging admin password required}"
: "${MONGO_REPLICA_KEY:?replica key required}"
if [ "$(id -u)" = 0 ]; then
  chown mongodb:mongodb /data/db
  exec gosu mongodb bash "$0"
fi
printf '%s' "$MONGO_REPLICA_KEY" > /data/db/replica.key
chmod 600 /data/db/replica.key
if [ ! -f /data/db/.maxride-initialized ]; then
  # Bootstrap accepts loopback connections only; no unauthenticated public listener.
  mongod --replSet rs0 --bind_ip 127.0.0.1 --dbpath /data/db --fork --logpath /tmp/maxride-bootstrap.log
  mongosh --quiet /usr/local/bin/initialize-staging.js
  mongod --shutdown --dbpath /data/db
  touch /data/db/.maxride-initialized
fi
exec mongod --replSet rs0 --auth --keyFile /data/db/replica.key --bind_ip_all --dbpath /data/db
