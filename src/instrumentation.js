/**
 * Next.js instrumentation — runs once when the server starts.
 * Boots the background workers that keep the realtime layer honest.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startDispatchSweeper } = await import('@/lib/realtime/dispatch');
  const { startLocationFlusher } = await import('@/lib/realtime/location-flusher');

  const { startNotificationWorker } = await import('@/lib/notifications');
  startNotificationWorker();
  startDispatchSweeper();
  startLocationFlusher();

  console.log('[Maxride] Background workers started (dispatch sweeper, location flusher)');
}
