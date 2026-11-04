export function dashboardForRole(role) {
  return role === 'admin' ? '/admin/dashboard' : role === 'driver' ? '/driver/dashboard' : '/dashboard';
}

export function safeCallback(value, role, origin = 'http://localhost:3000') {
  const fallback = dashboardForRole(role);
  if (typeof value !== 'string' || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u0020]/.test(decoded) || decoded.startsWith('//')) return fallback;
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password) return fallback;
    const path = url.pathname.replace(/\/$/, '');
    if (/^\/(api|login|signup)(\/|$)/.test(path)) return fallback;
    if (/^\/admin(\/|$)/.test(path) && role !== 'admin') return fallback;
    if (/^\/driver(\/|$)/.test(path) && role !== 'driver') return fallback;
    if (/^\/(dashboard|rides|wallet|deliveries)(\/|$)/.test(path) && !['rider', 'customer'].includes(role)) return fallback;
    return (path === '/admin' ? '/admin/dashboard' : path === '/driver' ? '/driver/dashboard' : url.pathname) + url.search + url.hash;
  } catch { return fallback; }
}
