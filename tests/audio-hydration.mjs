import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {demoLogin} from './demo-ride-flow.mjs';
import {chromium,expect} from '@playwright/test';
export async function audioHydrationChecks({base,User,Driver,password,check}){
 const user=await User.create({name:'Audio QA',username:'audio_'+Date.now(),role:'driver',passwordHash:await bcrypt.hash(password,4),wallet:{currency:'EGP',balance:1000}});await Driver.create({userId:user._id,isApproved:true,vehicle:{plate:'QA-AUDIO',type:'economy'}});const session=await demoLogin({base,username:user.username,password});const cookies={driver:session.cookies()};
 await check('Go Online unlocks the original incoming asset without sound diagnostic controls',async()=>{
  const browser=await chromium.launch({headless:false});let release;
  try{const c=await browser.newContext({permissions:['geolocation'],geolocation:{latitude:30.0444,longitude:31.2357,accuracy:5}});await c.addCookies(cookies.driver.split('; ').map(p=>({name:p.split('=')[0],value:p.slice(p.indexOf('=')+1),url:base})));const gate=new Promise(resolve=>{release=resolve;});
   await c.addInitScript(()=>{window.qaAudio=[];const Native=Audio;window.Audio=new Proxy(Native,{construct(C,args){const a=new C(...args);qaAudio.push(a);a.qaEvents=[];for(const event of ["playing","timeupdate","pause","error","loadeddata"]){a.addEventListener(event,()=>a.qaEvents.push({event,time:a.currentTime,paused:a.paused,error:a.error?.message,at:Date.now()}));}return a;}});});const page=await c.newPage();
   await page.route('**/api/auth/session',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
   const sound=await c.request.get(base+'/sounds/new-ride.mp3');assert.ok(sound.ok());const soundBody=await sound.body();
   await page.route('**/sounds/new-ride.mp3',async route=>{await new Promise(r=>setTimeout(r,1200));await route.fulfill({status:200,contentType:'audio/mpeg',body:soundBody});});
   await page.goto(base+'/driver/dashboard');await page.bringToFront();release();await expect(page.getByRole('button',{name:/Enable Sound|Test sound|Test Incoming Booking Sound/})).toHaveCount(0);await page.getByRole('button',{name:'Go online',exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>qaAudio.some(a=>a.src.endsWith('/sounds/new-ride.mp3')&&!a.error&&a.qaEvents.some(e=>e.event==='playing'))),{timeout:10000,intervals:[50,100]}).toBe(true).catch(async error=>{console.log('Media diagnostic',JSON.stringify(await page.evaluate(()=>qaAudio.map(a=>({src:a.src,time:a.currentTime,paused:a.paused,ready:a.readyState,error:a.error?.message,events:a.qaEvents}))),null,2));throw error;});
   await expect(page.getByRole('button',{name:'Go offline',exact:true})).toBeVisible();
   assert.ok(await page.evaluate(()=>qaAudio.some(a=>a.src.endsWith('/sounds/new-ride.mp3')&&a.volume===1&&!a.muted)));
  }finally{release?.();await browser.close();}
 });
}
