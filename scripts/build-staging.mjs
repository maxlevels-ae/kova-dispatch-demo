import { spawnSync } from 'node:child_process';
const origin = process.env.RENDER_EXTERNAL_URL || process.env.STAGING_APP_URL;
if (!origin || process.env.APP_ENV !== 'staging' || new URL(origin).hostname === 'kova-dispatch-demo.onrender.com') throw new Error('A separate staging URL is required');
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_APP_URL: new URL(origin).origin } });
process.exitCode = result.status ?? 1;
