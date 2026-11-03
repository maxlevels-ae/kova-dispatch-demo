export function stagingEnvironment(env = process.env) {
  if (env.APP_ENV !== 'staging') throw new Error('Staging runtime requires APP_ENV=staging');
  if (env.MONGODB_URI) throw new Error('Staging runtime refuses inherited MONGODB_URI; use dedicated staging host');
  if (!env.STAGING_MONGO_HOST || !env.STAGING_MONGO_PASSWORD || !env.REDIS_URL || !env.NEXTAUTH_SECRET) throw new Error('Isolated staging services and secret are required');
  if (env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET) throw new Error('Staging must not contain Stripe credentials');
  const host = env.STAGING_MONGO_HOST;
  if (!/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(host)) throw new Error('Invalid staging MongoDB host');
  const origin = env.RENDER_EXTERNAL_URL || env.STAGING_APP_URL;
  if (!origin || /kova-dispatch-demo\.onrender\.com/i.test(origin)) throw new Error('A separate staging URL is required');
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Staging must use HTTPS');
  return { ...env, NODE_ENV: 'production', MONGODB_URI: `mongodb://maxride_staging:${encodeURIComponent(env.STAGING_MONGO_PASSWORD)}@${host.includes(':') ? host : host + ':27017'}/maxride_staging?authSource=maxride_staging&replicaSet=rs0&directConnection=true`, NEXTAUTH_URL: url.origin, AUTH_URL: url.origin, AUTH_SECRET: env.NEXTAUTH_SECRET, NEXT_PUBLIC_APP_URL: url.origin, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', DEMO_WALLET_TOPUPS: 'false' };
}
