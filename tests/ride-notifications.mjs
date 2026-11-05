import {pickupFixture,journeyFixture} from './ride-safety-fixture.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:30000});
import {demoLogin} from './demo-ride-flow.mjs';
export async function notificationChecks({base,request,cookies,User,Driver,Ride,password,check}){
 const suffix=Date.now();const hash=await bcrypt.hash(password,10);
 const rider=await User.create({name:'Notification QA Rider',username:'notify_r_'+suffix,email:`notify_r_${suffix}@example.test`,passwordHash:hash,role:'rider',wallet:{balance:2000,currency:'EGP'}});
 const driver=await User.create({name:'Notification QA Driver',username:'notify_d_'+suffix,email:`notify_d_${suffix}@example.test`,passwordHash:hash,role:'driver',wallet:{balance:0,currency:'EGP'}});
 await Driver.create({userId:driver._id,isApproved:true,vehicle:{make:'Toyota',model:'Camry',color:'Silver',plate:'QA-NOTIFY',type:'economy',year:2022},location:{type:'Point',coordinates:[31.2357,30.0444]}});
 const r=await demoLogin({base,username:rider.username,password}),d=await demoLogin({base,username:driver.username,password});
 const settings=await(await request('/api/admin/settings/platform',cookies.admin)).json();
 await request('/api/admin/settings/platform',cookies.admin,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({section:'dispatch',revision:settings.records.find(s=>s._id==='dispatch')?.revision||0,value:{...settings.settings.dispatch,assignmentMode:'automatic',acceptanceSeconds:25,maxDailyTrips:undefined}})});
 // Full Chromium is required: the headless shell does not support native OS notifications.
 const browser=await chromium.launch({headless:false,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 let rideId;
 try{
  const pages={};const contexts={};const jsErrors=[];
  for(const [role,session] of [['rider',r],['driver',d]]){
   const c=await browser.newContext({viewport:{width:1280,height:900},permissions:['notifications','geolocation'],geolocation:{latitude:30.0444,longitude:31.2357,accuracy:5}});contexts[role]=c;
   await c.grantPermissions(['notifications','geolocation'],{origin:base});
   await c.addCookies(session.cookies().split('; ').map(pair=>({name:pair.split('=')[0],value:pair.slice(pair.indexOf('=')+1),url:base})));
   await c.addInitScript(()=>{window.qaAudio=[];window.qaPlayed=[];const NativeAudio=window.Audio;window.Audio=new Proxy(NativeAudio,{construct(target,args){const audio=new target(...args);audio.addEventListener('timeupdate',()=>{if(audio.currentTime>0)window.qaPlayed.push({src:audio.src,time:audio.currentTime,volume:audio.volume});});window.qaAudio.push(audio);return audio;}});});
   const page=await c.newPage();pages[role]=page;page.on('pageerror',e=>jsErrors.push(e.message));
   await page.goto(base+(role==='driver'?'/driver/dashboard':'/dashboard'),{waitUntil:'domcontentloaded'});
   const summary=page.getByLabel('Notifications',{exact:true});await expect(summary).toBeVisible({timeout:30000});await summary.click();
   await page.getByRole('button',{name:'Enable notifications',exact:true}).click();
   if(role==='driver'){
   await page.getByRole('button',{name:'Test sound',exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>qaPlayed.some(a=>a.src.includes('all-notify.mp3')&&a.time>0&&a.volume>0)),{timeout:10000}).toBe(true).catch(async e=>{console.log('AUDIO DIAGNOSTICS',role,await page.evaluate(()=>({played:qaPlayed,players:qaAudio.map(a=>({src:a.src,time:a.currentTime,paused:a.paused,volume:a.volume,ready:a.readyState,error:a.error?.message}))})),await page.locator('.notification-panel').innerText());throw e;});
   }else{
    await expect(page.getByRole('button',{name:'Test sound',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Test Incoming Booking Sound',exact:true})).toHaveCount(0);
   }
   await expect(page.getByText(/VAPID is not configured/).first()).toBeVisible();await page.getByRole('button',{name:'Close notifications',exact:true}).click();
  }
  await check('real Chromium sound playback, granted notification permission, and explicit disabled push status',async()=>{
   assert.equal(await pages.driver.evaluate(async()=>(await navigator.permissions.query({name:'notifications'})).state),'granted');
   assert.equal((await d.json('/api/notifications/push')).enabled,false);
  });
  await check('vehicle photo validation, owner/admin permissions and persistent image',async()=>{
   const url='/api/drivers/'+driver._id+'/vehicle-photo';
   assert.equal((await r.request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:'data:image/svg+xml;base64,PHN2Zz4='})})).status,403);
   assert.equal((await d.request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,YmFk'})})).status,400);
   const bytes=await sharp({create:{width:80,height:50,channels:3,background:'#777'}}).png().toBuffer();
   const result=await d.json(url,{image:'data:image/png;base64,'+bytes.toString('base64')});assert.ok(result.imageUrl.startsWith('/api/vehicle-photos/'));
   const photo=await d.request(result.imageUrl);assert.equal(photo.status,200);assert.equal((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).format,'webp');
  });
  await pages.driver.setViewportSize({width:390,height:844});await pages.driver.getByRole('region',{name:'Incoming sound'}).getByRole('button',{name:'Enable Sound',exact:true}).click();await expect(pages.driver.getByRole('region',{name:'Incoming sound'}).getByText('Sound Ready',{exact:true})).toBeVisible();await pages.driver.screenshot({path:'docs/qa/incoming-sound-mobile.png',fullPage:true});await pages.driver.setViewportSize({width:1280,height:900});await pages.driver.getByRole('button',{name:'Go online',exact:true}).click();await expect(pages.driver.getByRole('button',{name:'Go offline',exact:true})).toBeVisible();
  // Wait for the actual socket GPS sample to enter dispatch's index.
  await new Promise(resolve=>setTimeout(resolve,1500));
  const booked=await r.json('/api/rides',{pickup:{lat:30.0444,lng:31.2357,address:'QA notification pickup'},dropoff:{lat:30.05,lng:31.24,address:'QA notification destination'},vehicleType:'economy'});rideId=booked.ride.id;
  await check('incoming offer popup rings and native browser notification is displayed',async()=>{
   await expect(pages.driver.getByRole('button',{name:'Accept',exact:true})).toBeVisible({timeout:30000});
   await Promise.all([
   expect.poll(()=>pages.driver.evaluate(()=>qaAudio.some(a=>a.src.includes('new-ride.mp3')&&!a.paused&&a.loop&&a.currentTime>0)),{timeout:5000}).toBe(true),
   expect.poll(()=>pages.driver.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return(await reg.getNotifications()).some(n=>n.body==='New ride request');}),{timeout:10000}).toBe(true).catch(async e=>{console.log('NOTIFICATION DIAGNOSTICS',JSON.stringify(await d.json('/api/notifications')));console.log('BROWSER ERRORS',jsErrors,await pages.driver.evaluate(async()=>({permission:Notification.permission,worker:Boolean((await navigator.serviceWorker.getRegistration())?.active)}))); throw e;})
   ]);
   console.log('TAXI AUDIO EVIDENCE',await pages.driver.evaluate(()=>qaAudio.filter(a=>a.src.includes('new-ride.mp3')).map(a=>({src:a.src,currentTime:a.currentTime,paused:a.paused,loop:a.loop,error:a.error?.message||null}))));
   // Accept within the real offer deadline; screenshot capture can stall on
   // animated map frames and must not consume the driver's acceptance window.
   const acceptRequests=[];pages.driver.on('request',request=>{if(request.url().includes('/accept'))acceptRequests.push(request.url());});
   const acceptedResponse=pages.driver.waitForResponse(response=>response.url().endsWith(`/api/rides/${rideId}/accept`)&&response.request().method()==='POST',{timeout:60000}).catch(async error=>{console.log('ACCEPT REQUEST DIAGNOSTIC',{rideId,acceptRequests,jsErrors,body:await pages.driver.locator('body').innerText(),offer:await d.json('/api/drivers/me/offer')});throw error;});
   await pages.driver.getByRole('button',{name:'Accept',exact:true}).click();
   const accepted=await acceptedResponse;assert.equal(accepted.status(),200,JSON.stringify(await accepted.json()));
   await expect.poll(()=>pages.driver.evaluate(()=>qaAudio.every(a=>!a.loop||a.paused))).toBe(true);
   await expect(pages.driver.getByText('Head to pickup',{exact:true})).toBeVisible({timeout:15000}).catch(async e=>{console.log('ACCEPT DIAGNOSTIC',await pages.driver.locator('body').innerText());console.log('RIDE STATUS',(await r.json('/api/rides/'+rideId)).ride.status);throw e;});
  });
  await pages.rider.bringToFront();await pages.rider.reload();await expect(pages.rider.getByRole('region',{name:'Assigned vehicle'})).toBeVisible({timeout:30000}).catch(async e=>{console.log('RIDER DIAGNOSTIC',await pages.rider.locator('body').innerText(),jsErrors);console.log('ACTIVE RIDE',JSON.stringify(await r.json('/api/rides/active')));await pages.rider.screenshot({path:'.cache/notification-rider-failure.png'});throw e;});
  await check('acceptance inbox, vehicle details, arrival, bidirectional chat and duplicate protection',async()=>{
   await expect(pages.rider.getByRole('region',{name:'Assigned vehicle'})).toContainText('QA-NOTIFY');
   assert.ok((await r.json('/api/notifications')).notifications.some(n=>n.event==='driver_accepted'&&n.rideId===rideId));
   await pickupFixture(rideId);await pages.driver.getByRole('button',{name:'I’ve arrived',exact:true}).click();
   await expect.poll(async()=> (await r.json('/api/notifications')).notifications.some(n=>n.event==='driver_arrived'&&n.rideId===rideId)).toBe(true);
   const clientId=randomUUID();const sent=await r.json(`/api/rides/${rideId}/messages`,{text:'Hello driver, I am at pickup.',clientId});const replay=await r.json(`/api/rides/${rideId}/messages`,{text:'Hello driver, I am at pickup.',clientId});assert.equal(String(sent.message._id),String(replay.message._id));
   await d.json(`/api/rides/${rideId}/messages`,{text:'I can see you. Welcome!',clientId:randomUUID()});
   for(const session of [r,d]){const inbox=await session.json('/api/notifications');assert.equal(inbox.notifications.filter(n=>n.rideId===rideId&&n.event==='ride_message').length,1);}
   const before=await r.json('/api/notifications');await r.json('/api/notifications');assert.equal((await r.json('/api/notifications')).notifications.length,before.notifications.length);
   await pages.rider.getByRole('button',{name:/^Chat/}).click();await expect(pages.rider.getByRole('dialog',{name:'Chat'})).toContainText('I can see you. Welcome!',{timeout:30000});
   await pages.rider.screenshot({path:'docs/qa/ride-notification-chat.png',fullPage:true});
  });
  await check('reconnection resynchronizes messages and status without duplicate entries',async()=>{
   await contexts.rider.setOffline(true);await d.json(`/api/rides/${rideId}/messages`,{text:'Reconnect message',clientId:randomUUID()});await contexts.rider.setOffline(false);
   await expect(pages.rider.getByRole('dialog',{name:'Chat'})).toContainText('Reconnect message',{timeout:30000});
   await expect(pages.rider.getByRole('dialog',{name:'Chat'}).getByText('Reconnect message',{exact:false})).toHaveCount(1);
  });
  await pickupFixture(rideId);const active=await r.json(`/api/rides/${rideId}`);await d.json(`/api/rides/${rideId}/start`,{pin:active.ride.pin});await contexts.driver.setOffline(true);await journeyFixture(rideId);await d.json(`/api/rides/${rideId}/complete`,{});await contexts.driver.setOffline(false);
  await check('complete trip investigation is admin-only, audited and contains recorded events, messages, vehicle and settlement',async()=>{
   assert.equal((await r.request('/api/admin/rides/'+rideId)).status,403);assert.equal((await d.request('/api/admin/rides/'+rideId)).status,403);assert.equal((await request('/api/admin/rides/'+rideId)).status,401);
   const response=await request('/api/admin/rides/'+rideId,cookies.admin);assert.equal(response.status,200);const data=await response.json();assert.equal(data.ride.status,'completed');assert.equal(data.driver.vehicle.plate,'QA-NOTIFY');assert.equal(data.ride.messages.length,3);assert.ok(data.events.some(e=>e.event==='offer_sent'));assert.ok(data.ledger.length>=2);assert.ok(!JSON.stringify(data).includes('password'));assert.equal(data.ride.pin,undefined);
   const admin=await browser.newContext({viewport:{width:1440,height:1000}});await admin.addCookies(cookies.admin.split('; ').map(pair=>({name:pair.split('=')[0],value:pair.slice(pair.indexOf('=')+1),url:base})));
   const p=await admin.newPage();for(const id of [rider._id,driver._id]){await p.goto(base+'/admin/users/'+id);await p.getByRole('button',{name:'Activity',exact:true}).click();await p.getByRole('link',{name:'View full trip details'}).first().click();await expect(p.getByRole('heading',{name:'Trip investigation'})).toBeVisible();await expect(p.getByText('Hello driver, I am at pickup.',{exact:true})).toBeVisible();}
   await p.screenshot({path:'docs/qa/trip-investigation-desktop.png',fullPage:true});await p.setViewportSize({width:360,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:'docs/qa/trip-investigation-mobile.png',fullPage:true});await admin.close();
  });
  await check('notification preferences persist, hostile-origin changes are rejected, and denied browser permission is explained',async()=>{
   assert.equal((await r.request('/api/notifications',{method:'PUT',headers:{'content-type':'application/json',origin:'https://evil.test'},body:JSON.stringify({muted:true})})).status,403);
   const response=await r.request('/api/notifications',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({muted:true})});assert.equal(response.status,200);assert.equal((await r.json('/api/notifications')).preferences.muted,true);
   const denied=await browser.newContext();await denied.addCookies(r.cookies().split('; ').map(pair=>({name:pair.split('=')[0],value:pair.slice(pair.indexOf('=')+1),url:base})));
   const page=await denied.newPage();const cdp=await denied.newCDPSession(page);const {targetInfo}=await cdp.send('Target.getTargetInfo');await cdp.send('Browser.setPermission',{permission:{name:'notifications'},setting:'denied',origin:base,browserContextId:targetInfo.browserContextId});await page.goto(base+'/dashboard');await page.getByLabel('Notifications',{exact:true}).click();await expect(page.getByText(/Browser notifications are blocked/)).toBeVisible();await denied.close();
  });
  await check('decline, expiry and rider cancellation stop the offer ring and expired offers cannot be accepted',async()=>{
   await pages.driver.bringToFront();
   const reloadAt=Date.now();await pages.driver.reload();await expect(pages.driver.getByRole('button',{name:'Go offline',exact:true})).toBeVisible({timeout:30000}).catch(async e=>{console.log('RELOAD DIAGNOSTICS',await pages.driver.locator('body').innerText(),await d.json('/api/drivers/me'));throw e;});
   await pages.driver.getByLabel('Notifications',{exact:true}).click();await pages.driver.getByRole('button',{name:'Enable notifications',exact:true}).click();await expect(pages.driver.locator('.notification-panel').getByText(/Sound Ready/)).toBeVisible();await pages.driver.getByRole('button',{name:'Close notifications',exact:true}).click();
   await expect.poll(async()=>new Date((await Driver.findOne({userId:driver._id}).lean()).lastLocationUpdate).getTime(),{timeout:40000}).toBeGreaterThanOrEqual(reloadAt);
   for(const action of ['decline','expire','cancel']){
    // Refresh the disposable browser's stationary GPS fixture. Chromium's
    // static emulated fix otherwise ages out during the long admin checks.
    // The application must transport and persist it; never write DB GPS here.
    await pages.driver.waitForTimeout(4000);const sampleAt=Date.now();
    await contexts.driver.setGeolocation({latitude:30.0444,longitude:31.2357,accuracy:5});
    await expect.poll(async()=>{const profile=await Driver.findOne({userId:driver._id}).lean();return new Date(profile.lastLocationUpdate).getTime();},{timeout:30000}).toBeGreaterThanOrEqual(sampleAt);
    const result=await r.json('/api/rides',{pickup:{lat:30.0444,lng:31.2357,address:'QA offer lifecycle'},dropoff:{lat:30.05,lng:31.24,address:'QA lifecycle destination'},vehicleType:'economy'});rideId=result.ride.id;
    await expect(pages.driver.getByRole('button',{name:'Accept',exact:true})).toBeVisible({timeout:30000}).catch(async e=>{console.log('OFFER LIFECYCLE DIAGNOSTICS',action,await r.json('/api/rides/'+rideId),await d.json('/api/drivers/me'));throw e;});
    await expect.poll(()=>pages.driver.evaluate(()=>qaAudio.some(a=>a.loop&&!a.paused)),{timeout:10000}).toBe(true).catch(async e=>{console.log('LIFECYCLE AUDIO',action,await pages.driver.evaluate(()=>({audio:qaAudio.map(a=>({src:a.src,paused:a.paused,loop:a.loop,time:a.currentTime})),played:qaPlayed})),await pages.driver.locator('body').innerText());throw e;});
    if(action==='decline')await pages.driver.getByRole('button',{name:'Decline',exact:true}).click();
    if(action==='cancel')await r.json(`/api/rides/${rideId}/cancel`,{reason:'QA rider cancellation'});
    await expect(pages.driver.getByRole('button',{name:'Accept',exact:true})).toHaveCount(0,{timeout:30000});
    await expect.poll(()=>pages.driver.evaluate(()=>qaAudio.every(a=>!a.loop||a.paused))).toBe(true);
    await expect.poll(async()=> (await r.json('/api/rides/'+rideId)).ride.status,{timeout:15000}).not.toBe('searching');
    if(action==='expire')assert.equal((await d.request(`/api/rides/${rideId}/accept`,{method:'POST'})).status,409);
   }
  });
  assert.deepEqual(jsErrors,[]);
 }finally{
  if(rideId){const active=await Ride.findById(rideId).lean();if(active&&['accepted','arrived','searching'].includes(active.status))await r.json(`/api/rides/${rideId}/cancel`,{reason:'QA cleanup'}).catch(()=>{});}
  await d.json('/api/drivers/me/status',{online:false}).catch(()=>{});await browser.close();
 }
}
