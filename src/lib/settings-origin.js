// Only deployment configuration establishes trust; proxy/Host headers never do.
export function validSettingsOrigin(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin === "null" ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return false;
  const configured = [
    env.SETTINGS_PUBLIC_ORIGINS,
    env.NEXT_PUBLIC_APP_URL,
    env.AUTH_URL,
    env.NEXTAUTH_URL,
    env.RENDER_EXTERNAL_URL,
  ]
    .filter(Boolean)
    .flatMap((v) => v.split(","));
  const trusted = new Set();
  for (const value of configured) {
    try {
      const url = new URL(value.trim());
      if (
        !url.username &&
        !url.password &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      )
        trusted.add(url.origin);
    } catch {
      /* Invalid deployment configuration fails closed. */
    }
  }
  if (!configured.length && env.NODE_ENV !== "production") {
    const url = new URL(request.url);
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      trusted.add(url.origin);
  }
  return trusted.has(origin);
}
