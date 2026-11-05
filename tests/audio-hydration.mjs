import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
export async function audioHydrationChecks({base,cookies,check}){
 await check('incoming preview survives initial session hydration while the real audio asset loads',async()=>{
  const browser=await chromium.launch({headless:false});let release;
  try{const c=await browser.newContext();await c.addCookies(cookies.driver.split('; ').map(p=>({name:p.split('=')[0],value:p.slice(p.indexOf('=')+1),url:base})));const gate=new Promise(resolve=>{release=resolve;});
   await c.addInitScript(()=>{window.qaAudio=[];const Native=Audio;window.Audio=new Proxy(Native,{construct(C,args){const a=new C(...args);qaAudio.push(a);a.qaEvents=[];for(const event of ["playing","timeupdate","pause","error","loadeddata"]){a.addEventListener(event,()=>a.qaEvents.push({event,time:a.currentTime,paused:a.paused,error:a.error?.message,at:Date.now()}));}return a;}});});const page=await c.newPage();
   await page.route('**/api/auth/session',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
   await page.route('**/sounds/new-ride.mp3',async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,1200));await route.fulfill({response});});
   await page.goto(base+'/driver/dashboard');await page.bringToFront();await page.getByRole('region',{name:'Incoming sound'}).getByRole('button',{name:'Test Incoming Booking Sound',exact:true}).click();release();
   await expect.poll(()=>page.evaluate(()=>qaAudio.some(a=>a.src.endsWith('/sounds/new-ride.mp3')&&a.currentTime>0&&!a.paused&&!a.error)),{timeout:10000,intervals:[50,100]}).toBe(true).catch(async error=>{console.log('Media diagnostic',await page.evaluate(()=>qaAudio.map(a=>({src:a.src,time:a.currentTime,paused:a.paused,ready:a.readyState,error:a.error?.message,events:a.qaEvents}))));throw error;});
   await expect(page.getByRole('region',{name:'Incoming sound'}).getByText('Sound Ready',{exact:true})).toBeVisible();
   assert.ok(await page.evaluate(()=>qaAudio.some(a=>a.src.endsWith('/sounds/new-ride.mp3')&&a.volume===1&&!a.muted)));
  }finally{release?.();await browser.close();}
 });
}
