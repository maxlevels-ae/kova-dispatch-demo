import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require=createRequire(import.meta.url);
const root=dirname(require.resolve('maplibre-gl/package.json'));
const destination=new URL('../public/maplibre/',import.meta.url);
await mkdir(destination,{recursive:true});
for(const name of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'])await copyFile(join(root,'dist',name),new URL(name,destination));
await copyFile(join(root,'LICENSE.txt'),new URL('LICENSE.txt',destination));
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const files={};
for(const name of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'])
  files[name]=createHash('sha256').update(await readFile(new URL(name,destination))).digest('hex');
await writeFile(new URL('version.json',destination),JSON.stringify({version,files}));
console.log(`Prepared matching MapLibre ${version} module worker and shared runtime.`);
