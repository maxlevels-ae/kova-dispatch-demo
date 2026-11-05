import sharp from 'sharp';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='docs/qa/mx036',regions={search:{left:20,top:158,width:350,height:71},rideTile:{left:20,top:343,width:169,height:157},navigation:{left:14,top:758,width:362,height:70}};
const metrics={};
for(const [name,region] of Object.entries(regions)){
 const a=await sharp(dir+'/reference/home-390x844.png').extract(region).ensureAlpha().raw().toBuffer(),b=await sharp(dir+'/home-390x844.png').extract(region).ensureAlpha().raw().toBuffer();let different=0,sum=0;const diff=Buffer.alloc(a.length);
 for(let i=0;i<a.length;i+=4){let max=0;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);max=Math.max(max,d);sum+=d;diff[i+c]=d;}diff[i+3]=255;if(max>24)different++;}
 metrics[name]={pixels:region.width*region.height,differentPixelsAbove24:different,percentage:100*different/(region.width*region.height),meanChannelDifference:sum/(region.width*region.height*3)};
 await sharp(diff,{raw:{width:region.width,height:region.height,channels:4}}).png().toFile(dir+'/difference-'+name+'.png');assert.ok(metrics[name].percentage<5,`${name} exceeds visual threshold: ${metrics[name].percentage}%`);
}
await sharp({create:{width:780,height:844,channels:3,background:'#fff'}}).composite([{input:readFileSync(dir+'/reference/home-390x844.png'),left:0,top:0},{input:readFileSync(dir+'/home-390x844.png'),left:390,top:0}]).png().toFile(dir+'/home-comparison.png');
writeFileSync(dir+'/comparison.json',JSON.stringify({metrics,geometry:JSON.parse(readFileSync(dir+'/actual-geometry.json')),exclusions:['Prototype-only phone bezel and fake status bar','Actual account, country and published CMS content','Real MapLibre tiles, routing, positions and vehicle data','Wallet-only payments; unverified prototype Visa/COD options deliberately unavailable','Backend-backed states, timestamps, PIN and fares'],scope:'Pixel thresholds cover invariant Home regions. All other original states have reference and actual screenshots for visual inspection; no whole-application 100% pixel-parity claim.'},null,2));console.log(JSON.stringify(metrics,null,2));
