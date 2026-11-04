// Real OpenFreeMap network assets; synthetic label fixtures only in this local QA page.
import {createServer} from "node:http";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {chromium, expect} from "@playwright/test";
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/maplibre-gl.css">
<style>body{margin:0;font:16px Arial}#map{position:absolute;inset:48px 0 0}header{padding:14px;background:#faf9f6}</style>
<header>Maxride Arabic rendering QA • Cairo basemap • text fixtures are not real street locations</header><div id="map"></div>
<script type="module">
import {Map,Marker,setWorkerUrl} from '/maplibre-gl.mjs';
import {arabicMapStyle} from '/map-labels.js';
setWorkerUrl('/maplibre-gl-worker.mjs');
window.errors=[];
window.map=new Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[31.2357,30.0444],zoom:15,transformStyle:arabicMapStyle});
map.on('error',e=>errors.push(e.error.message));
window.addFixtures=()=>{
const names=['شارع الصناعة','شارع صلاح سالم','شارع الهرم','شارع التحرير','شارع التحرير / Tahrir Street 12'];
map.addSource('qa-labels',{type:'geojson',data:{type:'FeatureCollection',features:names.map((name,i)=>({type:'Feature',properties:{name},geometry:{type:'Point',coordinates:[31.2357,30.0484-i*.002]}}))}});
map.addLayer({id:'qa-labels',type:'symbol',source:'qa-labels',layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':25,'text-allow-overlap':true,'text-max-width':35},paint:{'text-color':'#111','text-halo-color':'#fff','text-halo-width':3}});
window.vehicle=new Marker().setLngLat([31.232,30.043]).addTo(map);
};
</script>`;
const served=new Set();
const server=createServer(async(req,res)=>{
  try{
    const name=req.url.slice(1);
    if(!name){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
    const path=name==='map-labels.js'?'src/lib/map-labels.js':
      ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'].includes(name)?'public/maplibre/'+name:
      ['maplibre-gl.mjs','maplibre-gl.css'].includes(name)?'node_modules/maplibre-gl/dist/'+name:null;
    if(!path){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(path));served.add(name);
  }catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(3193,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const failures=[],assets=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>failures.push(e.message));
  page.on('response',r=>{if(/openfreemap|maplibre/.test(r.url())){assets.push({url:r.url(),status:r.status()});if(r.status()>=400)failures.push(r.status()+' '+r.url());}});
  await page.goto('http://127.0.0.1:3193');
  await page.waitForFunction(()=>window.map?.isStyleLoaded()&&map.areTilesLoaded(),{},{timeout:90000}).catch(async e=>{console.log(JSON.stringify({failures,assets,errors:await page.evaluate(()=>window.errors)}));await page.screenshot({path:'.cache/arabic-failure.png'});throw e;});
  const actualNames=await page.evaluate(()=>map.queryRenderedFeatures().map(f=>f.properties?.name).filter(n=>/[\u0600-\u06ff]/.test(n)));
  assert.ok(actualNames.length>0,'Real Cairo Arabic labels loaded');
  await mkdir('docs/qa',{recursive:true});
  await page.screenshot({path:'docs/qa/arabic-cairo-real.png'});
  await page.evaluate(()=>addFixtures());
  await page.waitForFunction(()=>map.isStyleLoaded()&&map.areTilesLoaded());
  for(const [zoom,bearing] of [[15,0],[16,35],[14,-25]]){
    await page.evaluate(([zoom,bearing])=>{map.jumpTo({zoom,bearing});vehicle.setLngLat([31.234+(zoom-15)*.001,30.043]);},[zoom,bearing]);
    await expect.poll(()=>page.evaluate(()=>map.areTilesLoaded()),{timeout:60000}).toBe(true);
    await page.waitForTimeout(1000);
    await page.screenshot({path:'docs/qa/arabic-labels-z'+zoom+'.png'});
    assert.ok(await page.locator('.maplibregl-marker').isVisible());
  }
  for(const style of ['positron','dark']){
    await page.evaluate(style=>map.setStyle('https://tiles.openfreemap.org/styles/'+style),style);
    await page.waitForFunction(()=>map.isStyleLoaded()&&map.areTilesLoaded(),{},{timeout:90000});
    await page.evaluate(()=>addFixtures());
    await page.waitForFunction(()=>map.isStyleLoaded()&&map.areTilesLoaded());
    await page.screenshot({path:'docs/qa/arabic-'+style+'.png'});
  }
  assert.deepEqual(await page.evaluate(()=>errors),[]);
  assert.deepEqual(failures,[]);
  assert.ok(assets.some(a=>a.url.includes('/fonts/')),'Real font glyph requests');
  assert.ok(assets.some(a=>a.url.endsWith('maplibre-gl-worker.mjs')));
  // Worker imports do not emit page-level Playwright response events.
  // 6.16 may inline shared code; the companion file must still be served intact.
  const shared=await page.request.get('http://127.0.0.1:3193/maplibre-gl-shared.mjs');
  assert.equal(shared.status(),200);
  assert.equal(await shared.text(),await readFile('node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs','utf8'));
  assert.ok(served.has('maplibre-gl-shared.mjs'));
  await writeFile('.cache/arabic-browser-results.json',JSON.stringify({actualNames:[...new Set(actualNames)],assets,failures},null,2));
  console.log('PASS Arabic Cairo labels, four named fixtures, mixed script, zoom, rotation, moving marker, three styles; no asset or map errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
