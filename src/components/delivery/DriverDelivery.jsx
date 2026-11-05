'use client';
import {useCallback,useEffect,useState} from 'react';
import {useRouter,usePathname} from 'next/navigation';
import Link from 'next/link';
import {Package} from 'lucide-react';
import {useSocket} from '@/context/SocketProvider';
import {useNotifications} from '@/context/NotificationProvider';
import {unlockAudio,playAlert,stopAlert} from '@/lib/notification-audio';
import Modal from '@/components/ui/Modal';
import {deliveryMoney} from './DeliveryBooking';
export default function DriverDelivery(){
 const {socket}=useSocket(),n=useNotifications(),router=useRouter(),path=usePathname();const [offer,setOffer]=useState(null),[active,setActive]=useState(null),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[services,setServices]=useState({rides:true,deliveries:false}),[ready,setReady]=useState(false),[online,setOnline]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch('/api/drivers/me/delivery'),d=await r.json();if(!r.ok)throw Error(d.error);setOffer(d.online?d.offer:null);setActive(d.active);setOnline(d.online);}catch(e){setError(e.message);}},[]);
 useEffect(()=>{fetch('/api/drivers/me').then(r=>r.json()).then(d=>{if(d.driver?.services)setServices(d.driver.services);setReady(true);}).catch(e=>setError(e.message));},[]);
 useEffect(()=>{load();socket?.on('delivery:update',load);socket?.on('connect',load);socket?.on('ride:accepted',load);const timer=setInterval(load,3000);return()=>{clearInterval(timer);socket?.off('delivery:update',load);socket?.off('connect',load);socket?.off('ride:accepted',load);};},[socket,load]);
 useEffect(()=>{if(!offer||!online||busy)return;let ended=false;const close=async()=>{const registration=await navigator.serviceWorker?.getRegistration();for(const notice of await registration?.getNotifications()||[])if(notice.data?.href?.endsWith('/'+offer.id))notice.close();};
  if(offer.soundEnabled!==false&&n?.preferences.driverSound&&!n?.preferences.muted&&n?.policy.driverSound!==false)playAlert({key:'offer:delivery:'+offer.offerId,offer:true,expiresAt:offer.expiresAt});
  const update=()=>{const left=Math.max(0,Math.ceil((Date.parse(offer.expiresAt)-Date.now())/1000));setSeconds(left);if(!left&&!ended){ended=true;setOffer(null);stopAlert();close().catch(()=>{});}};update();const timer=setInterval(update,500);return()=>{clearInterval(timer);stopAlert('offer:delivery:'+offer.offerId);close().catch(()=>{});};
 },[busy,online,offer?.offerId,offer?.expiresAt,offer?.soundEnabled,n?.preferences.driverSound,n?.preferences.muted,n?.policy.driverSound,n?.audioReady]);

 useEffect(()=>{if(path==='/driver/dashboard'||(!online&&!active)||!socket||!navigator.geolocation)return;const update=position=>socket.emit('driver:location',{lat:position.coords.latitude,lng:position.coords.longitude,heading:position.coords.heading,speed:position.coords.speed,accuracy:position.coords.accuracy});const options={enableHighAccuracy:true,maximumAge:2000,timeout:12000};const watch=navigator.geolocation.watchPosition(update,()=>{},options);const timer=setInterval(()=>navigator.geolocation.getCurrentPosition(update,()=>{},options),15000);return()=>{navigator.geolocation.clearWatch(watch);clearInterval(timer);};},[path,online,Boolean(active),socket]);
 const act=async action=>{if(busy||!offer)return;stopAlert();setBusy(true);setError('');try{const r=await fetch(`/api/deliveries/${offer.id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),d=await r.json();if(!r.ok)throw Error(d.error);const id=offer.id;setOffer(null);await load();if(action==='accept')router.push('/driver/deliveries/'+id);}catch(e){setError(e.message);}finally{setBusy(false);}};
 const save=async()=>{if(busy)return;setBusy(true);setError('');setSaved('');await unlockAudio();try{const r=await fetch('/api/drivers/me/services',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(services)}),d=await r.json();if(!r.ok)throw Error(d.error);setSaved('Settings saved successfully');}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <>
  {path==='/driver/dashboard'&&<section className="driver-service-bar"><Package size={18}/><label><input type="checkbox" checked={services.rides} disabled={busy||!ready||Boolean(active)} onChange={e=>setServices(s=>({...s,rides:e.target.checked}))}/> Ride requests</label><label><input type="checkbox" checked={services.deliveries} disabled={busy||!ready||Boolean(active)} onChange={e=>setServices(s=>({...s,deliveries:e.target.checked}))}/> Delivery requests</label><button className="btn btn-secondary btn-sm" disabled={busy||!ready||Boolean(active)} onClick={save}>Save preferences</button>{saved&&<span role="status">{saved}</span>}{active&&<Link className="btn btn-primary btn-sm" href={'/driver/deliveries/'+active._id}>Continue delivery</Link>}</section>}
  {error&&<p className="delivery-error" role="alert">{error}</p>}
  <Modal open={Boolean(offer)} title="New delivery request" closable={false}>{offer&&<><p><strong>{seconds}s</strong> · {offer.package.size} package · {offer.package.weight} kg</p><p><strong>Pickup:</strong> {offer.pickup.address}</p><p><strong>Destination:</strong> {offer.dropoff.address}</p><p>{(offer.route.distanceMeters/1000).toFixed(1)} km · {Math.ceil(offer.route.durationSeconds/60)} min</p>{offer.pickupETA&&<p>Estimated pickup: {offer.pickupETA} min</p>}<p>Estimated earnings: <strong>{deliveryMoney(offer.earnings,offer.currency)}</strong></p><div className="flex gap-2 mt-4"><button className="btn btn-secondary" disabled={busy} onClick={()=>act('decline')}>Decline delivery</button><button className="btn btn-primary" disabled={busy||!seconds} onClick={()=>act('accept')}>Accept delivery</button></div></>}</Modal>
 </>;
}
