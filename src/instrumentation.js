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
  const {default:connectDB}=await import('@/lib/db/mongodb');
  if(process.env.MONGODB_URI){const db=await connectDB();await db.connection.collection('ridegpssamples').createIndex({expiresAt:1},{expireAfterSeconds:0});await db.connection.collection('ridegpssamples').createIndex({rideId:1,at:1});}
  const {startDeliveryWorker}=await import('@/lib/delivery-dispatch');
  startDeliveryWorker();

  console.log('[Maxride] Background workers started (dispatch sweeper, location flusher)');
}
