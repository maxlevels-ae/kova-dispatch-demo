'use client';
import {t as tr,customerLocale} from '@/lib/i18n';
import {useI18n} from '@/context/LanguageProvider';
import {useEffect,useState} from 'react';
import {CheckCircle2} from 'lucide-react';
import {useNotifications} from '@/context/NotificationProvider';
export default function NotificationControls(){
  useI18n();
 const n=useNotifications();const [hydrated,setHydrated]=useState(false);const [ready,setReady]=useState(false),[push,setPush]=useState(null),[subscribed,setSubscribed]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[saved,setSaved]=useState(null);
 useEffect(()=>{setHydrated(true);fetch('/api/notifications/push').then(r=>r.json()).then(setPush).catch(()=>setPush({enabled:false})).finally(()=>setReady(true));navigator.serviceWorker?.getRegistration().then(r=>r?.pushManager.getSubscription()).then(s=>setSubscribed(Boolean(s))).catch(()=>{});},[]);
 if(!n)return null;
 const run=async(fn,save=false)=>{if(busy)return;setBusy(true);setStatus('');try{await fn();if(save){setStatus('Settings saved successfully · تم حفظ الإعدادات بنجاح');setSaved(new Date());}}catch(e){setStatus(e.message);}finally{setBusy(false);}};
 const subscription=async()=>{
  if(!('serviceWorker'in navigator)||!('PushManager'in window))throw Error('Web Push is not supported in this browser. Foreground alerts remain available.');
  const registration=await navigator.serviceWorker.register('/notifications-sw.js');await navigator.serviceWorker.ready;
  let sub=await registration.pushManager.getSubscription();
  if(subscribed&&sub){const r=await fetch('/api/notifications/push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})});if(!r.ok)throw Error('Unable to remove subscription');await sub.unsubscribe();setSubscribed(false);return;}
  if(n.permission!=='granted')throw Error('Enable browser notifications first.');
  sub ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(push.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))});
  const {endpoint,keys}=sub.toJSON();const r=await fetch('/api/notifications/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint,keys})});const d=await r.json();if(!r.ok)throw Error(d.error);setSubscribed(true);
 };
 return <div className="notification-preferences">
  <div className="flex gap-2 wrap"><button type="button" className="btn btn-secondary btn-sm" disabled={busy||!hydrated} onClick={()=>run(n.enableSound,true)}>{tr("Enable Sound")}</button><button type="button" className="btn btn-secondary btn-sm" disabled={busy||!hydrated} onClick={()=>run(n.enable)}>{tr("Enable notifications")}</button><button type="button" className="btn btn-secondary btn-sm" disabled={busy||!hydrated} onClick={()=>run(()=>n.testSound(false))}>{tr("Test sound")}</button><button type="button" className="btn btn-secondary btn-sm" disabled={busy||!hydrated} onClick={()=>run(()=>n.testSound(true))}>{tr("Test Incoming Booking Sound")}</button></div>
  <p className="tiny muted">{tr("Browser permission:")}{' '}{tr(n.permission)}{' '}{tr(". Sound:")}{' '}{tr(n.audioReady?'ready':'tap Enable notifications or Test sound')}.</p>
  <p role="status" aria-live="polite">{tr(n.audioReady?"Sound Ready":"Sound Blocked")}{n.soundStatus?.error&&" · "+tr(n.soundStatus.error)}</p>
  <p className="tiny muted">{tr("Device silent mode and background browser limits may prevent audible alerts.")}</p>
  {n.permission==='denied'&&<p role="status">{tr("Browser notifications are blocked. Change this site’s permission in browser settings. Ride popups remain visible.")}</p>}
  <p className="tiny muted">{tr("Background push:")}{' '}{tr(push?.enabled?(subscribed?'subscribed on this browser':'configured, not subscribed on this browser'):'disabled — VAPID is not configured')}.</p>
  {push?.enabled&&<button type="button" className="btn btn-secondary btn-sm" disabled={busy||!ready} onClick={()=>run(subscription)}>{tr(subscribed?'Disable background push':'Subscribe to background push')}</button>}
  <details><summary className="small">{tr("Notification preferences")}</summary>{Object.entries({inApp:'In-app inbox',driverSound:'Driver new booking sound',riderSound:'Rider trip sound',messages:'Message notifications',rideEvents:'Ride-event notifications',browser:'Browser notifications',push:'Background push',muted:'Mute sound and browser alerts'}).map(([key,label])=><label className="flex gap-2 mt-2" key={key}><input type="checkbox" checked={n.preferences[key]} disabled={busy||!ready} onChange={e=>run(()=>n.save({[key]:e.target.checked}),true)}/>{tr(label)}</label>)}</details>
  <p role="status" aria-live="polite">{status&&saved&&status.startsWith('Settings saved')&&<CheckCircle2 size={16}/>} {tr(status)}{' '}{saved&&status.startsWith('Settings saved')&&<time dateTime={saved.toISOString()}>{tr("· Saved")}{' '}{tr(saved.toLocaleTimeString(customerLocale()))}</time>}</p>
 </div>;
}
