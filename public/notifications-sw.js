/* No app/data caching. Push payloads contain no credentials or chat content. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function safeLink(value){return /^\/(?:rides|driver\/trips)\/[a-f\d]{24}$/i.test(value)||/^\/driver\/dashboard(?:\?ride=[a-f\d]{24})?$/i.test(value)?value:'/dashboard';}
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 if(data.expiresAt&&Date.parse(data.expiresAt)<Date.now())return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 // The foreground inbox handles sound/display. Background uses one tagged OS notification.
 if(windows.some(c=>c.visibilityState==='visible')){windows.forEach(c=>c.postMessage({type:'notification-sync'}));return;}
 await self.registration.showNotification('Maxride',{body:String(data.body||'Ride update').slice(0,300),tag:String(data.id),data:{href:safeLink(data.href)},icon:'/favicon.ico'});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const url=new URL(safeLink(event.notification.data?.href),self.location.origin).href;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const client=windows.find(c=>new URL(c.url).origin===self.location.origin);
 if(client){await client.navigate(url);await client.focus();}else await self.clients.openWindow(url);
})());});
