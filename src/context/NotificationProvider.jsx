'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {useSession} from 'next-auth/react';
import {useSocket} from './SocketProvider';
import {useToast} from '@/components/ui/Toast';
import {preferenceDefaults,safeNotificationLink} from '@/lib/notification-policy';
import {playAlert,stopAlert,unlockAudio,audioStatus,subscribeAudio} from '@/lib/notification-audio';
import {browserNotificationPermission} from '@/lib/browser-notification-permission';
const Context=createContext(null);
export function NotificationProvider({children}){
 const {data:session}=useSession();const {socket}=useSocket();const toast=useToast();
 const [items,setItems]=useState([]),[unread,setUnread]=useState(0),[preferences,setPreferences]=useState(preferenceDefaults),[policy,setPolicy]=useState({}),[error,setError]=useState(''),[audioReady,setAudioReady]=useState(false),[permission,setPermission]=useState('default');
 const [soundStatus,setSoundStatus]=useState(audioStatus);
 useEffect(()=>subscribeAudio(s=>{setSoundStatus(s);setAudioReady(s.ready);}),[]);
 const seen=useRef(new Set()),state=useRef({preferences,policy});
 useEffect(()=>{state.current={preferences,policy};},[preferences,policy]);
 const role=session?.user?.role;
 const userId=session?.user?.id;
 useEffect(()=>()=>stopAlert(),[userId]);
 const display=useCallback(async n=>{
  if(seen.current.has(n.key))return;seen.current.add(n.key);if(seen.current.size>500)seen.current.delete(seen.current.values().next().value);
  if(n.readAt||Date.now()-new Date(n.createdAt)>60000||(n.expiresAt&&Date.parse(n.expiresAt)<Date.now()))return;
  const claim=()=>{try{const storageKey='maxride-notification-seen:'+n.userId;const entries=JSON.parse(localStorage.getItem(storageKey)||'[]').filter(e=>Date.now()-e.at<300000);if(entries.some(e=>e.key===n.key))return false;localStorage.setItem(storageKey,JSON.stringify([...entries,{key:n.key,at:Date.now()}].slice(-200)));}catch{/* Private storage may be unavailable. */}return true;};
  const claimed=navigator.locks?await navigator.locks.request('maxride-notification-display',claim):claim();if(!claimed)return;
  const {preferences:p,policy:s}=state.current;
  if(!p.inApp||(['ride_message','delivery_message'].includes(n.event)?!p.messages:!p.rideEvents))return;
  if(!['booking_offer','delivery_offer'].includes(n.event))toast(n.text,'info');
  const sound=['ride_message','delivery_message'].includes(n.event)?s.messageSound!==false:role==='driver'?s.driverSound!==false:s.riderSound!==false;
  if(!['booking_offer','delivery_offer'].includes(n.event)&&sound&&!p.muted&&(role==='driver'?p.driverSound:p.riderSound)){
   if(!await playAlert({key:n.key}))setAudioReady(false);
  }
  if(p.browser&&!p.muted&&await browserNotificationPermission()==='granted'){
   // When background push is subscribed the service worker owns OS delivery.
   const registration=await navigator.serviceWorker?.getRegistration().catch(()=>null);
   const subscription=await registration?.pushManager?.getSubscription().catch(()=>null);
   if(document.visibilityState==='hidden'&&subscription)return;
   const options={body:n.text,tag:String(n._id),data:{href:safeNotificationLink(n.href)}};
   if(registration&&!registration.active)await navigator.serviceWorker.ready;
   if(registration)await registration.showNotification('Maxride',options).catch(()=>setError('Browser notification could not be displayed. Check browser and operating-system notification permissions.'));
   else {try{const notice=new Notification('Maxride',options);notice.onclick=()=>{window.focus();window.location.assign(safeNotificationLink(n.href));notice.close();};}catch{/* Browser requires a service worker. */}}
  }
 },[role,toast]);
 const refresh=useCallback(async()=>{
  if(!userId)return;
  try{const r=await fetch('/api/notifications');const d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.notifications);setUnread(d.unreadCount);setPreferences(d.preferences);setPolicy(d.soundPolicy);setPermission(await browserNotificationPermission());state.current={preferences:d.preferences,policy:d.soundPolicy};setError('');for(const n of [...d.notifications].reverse())await display(n);}catch(e){setError(e.message);}
 },[userId,display]);
 useEffect(()=>{
  if(!userId)return;
  browserNotificationPermission().then(setPermission);
  refresh();const timer=setInterval(refresh,10000);const onVisible=()=>{if(!document.hidden)refresh();};
  socket?.on('notification:new',refresh);socket?.on('connect',refresh);document.addEventListener('visibilitychange',onVisible);navigator.serviceWorker?.addEventListener('message',refresh);
  return()=>{clearInterval(timer);socket?.off('notification:new',refresh);socket?.off('connect',refresh);document.removeEventListener('visibilitychange',onVisible);navigator.serviceWorker?.removeEventListener('message',refresh);};
 },[userId,refresh,socket]);
 const save=async patch=>{const r=await fetch('/api/notifications',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});const d=await r.json();if(!r.ok)throw Error(d.error);setPreferences(p=>({...p,...patch}));await refresh();};
 const markRead=async id=>{const r=await fetch('/api/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{id}:{})});if(!r.ok)throw Error('Unable to mark notifications read');await refresh();};
 const enable=async()=>{
  setAudioReady(await unlockAudio());
  if(typeof Notification==='undefined'){setError('Browser notifications are not supported here. In-app alerts remain available.');return;}
  const result=await Notification.requestPermission();setPermission(result);
  if(result==='denied'){setError('Notifications are blocked. Allow notifications in your browser site settings; visible ride alerts still work.');return;}
  if(result==='granted'&&'serviceWorker' in navigator){await navigator.serviceWorker.register('/notifications-sw.js');await navigator.serviceWorker.ready;}
 };
 const enableSound=async()=>{const allowed=await unlockAudio();await save({driverSound:true,muted:false});if(!allowed)throw Error(audioStatus().error);};
 const testSound=async offer=>{if(!await playAlert({key:'preview',offer,expiresAt:new Date(Date.now()+3000).toISOString()}))throw Error('Sound is blocked by the browser. Try enabling notifications first.');};
 return <Context.Provider value={{items,unread,preferences,policy,error,permission,audioReady,soundStatus,enableSound,refresh,save,markRead,enable,testSound}}>{children}</Context.Provider>;
}
export const useNotifications=()=>useContext(Context);
