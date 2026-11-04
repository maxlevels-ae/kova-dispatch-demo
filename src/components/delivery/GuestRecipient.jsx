"use client";
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {Package,ShieldCheck} from 'lucide-react';
import MapView from '@/components/maps/MapView';
import {translate,setClientLanguage} from '@/lib/i18n';
export default function GuestRecipient(){
 const {id}=useParams(),[language,setLanguage]=useState('en'),[order,setOrder]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const t=text=>translate(text,language);
 useEffect(()=>{const saved=sessionStorage.getItem('recipient-language');if(saved==='ar')setLanguage(saved);},[]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';setClientLanguage(language);sessionStorage.setItem('recipient-language',language);},[language]);
 useEffect(()=>{
  const token=location.hash.slice(1);let active=true;const controller=new AbortController();
  async function load(){try{
   const response=await fetch('/api/guest/deliveries/'+id,{method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   if(active){setOrder(data);setError('');}
  }catch(e){if(active){setOrder(null);setError(e.message);}}}
  const changed=()=>{setOrder(null);setRetry(value=>value+1);};window.addEventListener('hashchange',changed);
  load();const timer=setInterval(load,15000);return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('hashchange',changed);};
 },[id,retry]);
 return <main className="content-pad" style={{maxWidth:720,marginInline:'auto'}}><header className="flex items-center justify-between wrap gap-2 mb-4"><div><Package/><h1>{t('Maxride Delivery')}</h1></div><label>{t('Language')}<select className="input" aria-label="Language / اللغة" value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="ar">العربية</option></select></label></header>
 <section className="card card-pad mb-4"><h2><ShieldCheck size={20}/> {t('Link-based confirmation')}</h2><p>{t('Keep this link private. It grants access to your delivery confirmation code. It does not verify phone ownership.')}</p></section>
 {error?<section className="card card-pad"><p role="alert">{t(error)}</p><p>{t('Ask the sender for a new private link.')}</p><button className="btn btn-secondary" onClick={()=>setRetry(n=>n+1)}>{t('Retry')}</button></section>:!order?<p role="status">{t('Loading…')}</p>:<>
 <section className="card card-pad mb-4"><p className="tiny"><bdi>{order.reference}</bdi></p><h2>{t(order.status)}</h2><p><bdi>{order.dropoff.address}</bdi></p>{order.courier&&<><h3>{t('Courier')}: <bdi>{order.courier.name}</bdi></h3><p><bdi>{order.vehicle?.make} {order.vehicle?.model} · {order.vehicle?.color} · {order.vehicle?.plate}</bdi></p></>}<div className="delivery-tracking-map"><MapView publicMap dropoff={order.dropoff} driverPosition={order.courier?.location} fit/></div></section>
 <section className="card card-pad"><h2>{t('Recipient delivery code')}</h2><p>{t('Only share this code when the package is physically handed over.')}</p>{order.code?<bdi dir="ltr" className="delivery-code">{order.code}</bdi>:<p>{t(order.confirmedAt?'Recipient confirmed':'Confirmation code is unavailable. Ask the sender to renew the link if needed.')}</p>}<p className="small">{t('Code expires at')}: {new Date(order.expiresAt).toLocaleString(language==='ar'?'ar-EG':'en-EG')}</p>{order.confirmedAt&&<time>{new Date(order.confirmedAt).toLocaleString(language==='ar'?'ar-EG':'en-EG')}</time>}</section>
 </>}
 </main>;
}
