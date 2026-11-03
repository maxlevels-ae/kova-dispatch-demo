import { spawn } from 'node:child_process';
import { stagingEnvironment } from './staging-config.mjs';
import { seedStaging } from './staging-seed.mjs';
const env = stagingEnvironment();
await seedStaging(env);
const server = spawn(process.execPath, ['server.js'], { env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', code => { process.exitCode = code ?? 1; });
