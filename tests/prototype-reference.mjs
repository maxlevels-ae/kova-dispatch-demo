// Capture the supplied, unmodified HTML. Its mock state is used only in this
// reference document; no prototype runtime or mock business logic ships in Next.
import {chromium,expect} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=resolve('design/reference/prototype/Maxride App.dc.html'),dir='docs/qa/mx036/reference';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:470,height:924}});await page.goto(pathToFileURL(source).href);await expect(page.getByText('Sara',{exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>{const frame=[...document.querySelectorAll('div')].find(e=>e.style.width==='390px'&&e.style.height==='844px');frame.dataset.referenceFrame='true';
  function find(f){if(!f)return null;if(f.stateNode?.logic?.state?.s)return f.stateNode.logic;return find(f.child)||find(f.sibling);}
  for(const e of document.querySelectorAll('*')){for(const k of Object.keys(e)){if(k.startsWith('__reactContainer')||k.startsWith('__reactFiber')){let fiber=e[k]?.current||e[k];while(fiber?.return)fiber=fiber.return;const logic=find(fiber);if(logic){window.referenceLogic=logic;clearInterval(logic.iv);return;}}}}throw Error('Reference runtime instance not found');
 });
 const frame=page.locator('[data-reference-frame]');
 for(const [name,patch] of Object.entries({home:{s:'home'},map:{s:'map'},search:{s:'search'},options:{s:'options',dest:'Central Station'},payment:{s:'options',showPay:true},finding:{s:'finding'},arriving:{s:'drive',stage:'arriving'},trip:{s:'drive',stage:'trip'},rate:{s:'rate'},explore:{s:'grid'},place:{s:'place'},cancel:{s:'drive',showCancel:true},cancelled:{s:'cancelled'},menu:{s:'home',menu:true},sos:{s:'drive',showSos:true}})){
  await page.evaluate(p=>window.referenceLogic.setState({showPay:false,showCancel:false,showSos:false,menu:false,hero:0,stage:'arriving',...p}),patch);await page.waitForTimeout(400);await frame.screenshot({path:dir+'/'+name+'-390x844.png',animations:'disabled'});
  if(name==='home'){const metrics=await frame.evaluate(root=>{const rr=root.getBoundingClientRect();const style=e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x-rr.x,y:r.y-rr.y,width:r.width,height:r.height,fontSize:c.fontSize,borderRadius:c.borderRadius,background:c.backgroundColor};};return {where:style([...root.querySelectorAll('button')].find(e=>e.textContent.includes('Where to?'))),car:style(root.querySelector('img[src="assets/tile_car.png"]')),delivery:style(root.querySelector('img[src="assets/tile_delivery.png"]'))};});writeFileSync(dir+'/geometry.json',JSON.stringify(metrics,null,2));}
 }
 writeFileSync(dir+'/source.json',JSON.stringify({source:'design/reference/prototype/Maxride App.dc.html',sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),viewport:{width:390,height:844},note:'Unmodified prototype reference. Fake status bar/bezel, map imagery, account/marketing/financial data are excluded from production parity comparisons.'},null,2));console.log('Captured 15 original prototype states at 390×844.');
}finally{await browser.close();}
