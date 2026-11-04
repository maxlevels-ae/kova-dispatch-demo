'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Package,ArrowLeft,ArrowRight,CheckCircle2} from 'lucide-react';
import PlaceSearch from '@/components/maps/PlaceSearch';
import MapView from '@/components/maps/MapView';
import {useI18n} from '@/context/LanguageProvider';
import {t,customerLocale} from '@/lib/i18n';
export const deliveryMoney=value=>new Intl.NumberFormat(customerLocale(),{style:'currency',currency:'EGP'}).format(value||0);
export function DeliveryField({label,value,onChange,type='text',options,required=true,...props}){return <label className="delivery-field"><span>{t(label)}</span>{options?<select className="input" aria-label={t(label)} value={value} onChange={e=>onChange(e.target.value)} required={required} {...props}>{options.map(v=><option key={v} value={v}>{t(v)}</option>)}</select>:<input className="input" aria-label={t(label)} type={type} value={value??''} onChange={e=>onChange(type==='number'?Number(e.target.value):e.target.value)} required={required} dir={type==='tel'?'ltr':undefined} {...props}/>}</label>;}
export async function uploadDeliveryImage(file,kind,deliveryId){
 if(!file||file.size>2097152||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP image up to 2 MB');
 const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
 const response=await fetch('/api/deliveries/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,kind,deliveryId})}),data=await response.json();if(!response.ok)throw Error(data.error);return data;
}
export default function DeliveryBooking(){
 useI18n();const router=useRouter();const [config,setConfig]=useState(null),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[estimate,setEstimate]=useState(null),[preview,setPreview]=useState(null),[routing,setRouting]=useState(false),[routeError,setRouteError]=useState(''),[routeRetry,setRouteRetry]=useState(0);
 const [form,setForm]=useState({pickup:null,dropoff:null,sender:{name:'',phone:'',instructions:''},recipient:{name:'',phone:'',instructions:''},package:{category:'Documents',size:'small',weight:1,length:20,width:15,height:10,description:'',handling:''},region:'Cairo',acknowledged:false,idempotencyKey:''});
 const [texts,setTexts]=useState({pickup:'',dropoff:''});
 useEffect(()=>{let live=true;fetch('/api/deliveries/config').then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(live){setConfig(d.settings);setForm(f=>({...f,idempotencyKey:crypto.randomUUID(),region:d.settings.general.regions[0],package:{...f.package,category:d.settings.packages.categories[0]}}));}}).catch(e=>setError(e.message));return()=>{live=false;};},[]);
 useEffect(()=>{
  setPreview(null);setRouteError('');setEstimate(null);
  if(!form.pickup||!form.dropoff){setRouting(false);return;}
  const controller=new AbortController();setRouting(true);
  const timer=setTimeout(async()=>{try{
   const coordinates=p=>({lat:p.lat,lng:p.lng});
   const response=await fetch('/api/deliveries/route-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pickup:coordinates(form.pickup),dropoff:coordinates(form.dropoff)}),signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   if(!controller.signal.aborted){setPreview(data.route);if(!data.roadRouteAvailable)setRouteError('Road routing is unavailable. Distance and duration are approximate.');}
  }catch(e){if(!controller.signal.aborted)setRouteError(e.message);}finally{if(!controller.signal.aborted)setRouting(false);}},250);
  return()=>{controller.abort();clearTimeout(timer);};
 },[form.pickup,form.dropoff,routeRetry]);
 const change=(section,key,value)=>{setEstimate(null);setForm(f=>({...f,[section]:{...f[section],[key]:value}}));};
 const run=async callback=>{if(busy)return;setBusy(true);setError('');try{await callback();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const next=e=>{e.preventDefault();run(async()=>{
  if(step<2&&!form[step===0?'pickup':'dropoff'])throw Error('Select an address from the search results.');
  if(step===2){const r=await fetch('/api/deliveries/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}),d=await r.json();if(!r.ok)throw Error(d.error);setEstimate(d);}
  if(step===4){const r=await fetch('/api/deliveries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}),d=await r.json();if(!r.ok)throw Error(d.error);router.push('/deliveries/'+d.order._id);return;}
  setStep(s=>s+1);
 });};
 const steps=['Pickup','Dropoff','Package','Estimate','Confirm'];
 return <div className="content-pad delivery-booking"><header className="mb-4"><Package size={28}/><h1>{t('Send a Package')}</h1><p className="muted">{t(config?.general.name||'Maxride Delivery')}</p></header>
  {error&&<p role="alert" className="delivery-error">{t(error)}</p>}
  {!config?<p>{t('Loading…')}</p>:!config.general.enabled?<p>{t('Delivery is currently unavailable.')}</p>:<>
   <ol className="delivery-steps" aria-label={t('Delivery booking steps')}>{steps.map((name,i)=><li key={name} aria-current={i===step?'step':undefined}><span>{i+1}</span>{t(name)}</li>)}</ol>
   <div className="delivery-booking-grid"><form onSubmit={next} className="card card-pad">
    <h2 className="mb-4">{t(steps[step])}</h2>
    {step<2&&<><label className="delivery-field"><span>{t(steps[step])}</span><PlaceSearch value={texts[step===0?'pickup':'dropoff']} onChangeText={value=>{const key=step===0?'pickup':'dropoff';setTexts(v=>({...v,[key]:value}));setForm(f=>({...f,[key]:null}));}} committedValue={form[step===0?'pickup':'dropoff']?.address} onSelect={place=>{const key=step===0?'pickup':'dropoff';setForm(f=>({...f,[key]:{lat:place.lat,lng:place.lng,address:place.address}}));setTexts(v=>({...v,[key]:place.address}));}} placeholder={t('Search a place…')} bias={{lat:30.0444,lng:31.2357}}/></label>
     <DeliveryField label={step===0?'Sender name':'Recipient name'} value={form[step===0?'sender':'recipient'].name} onChange={v=>change(step===0?'sender':'recipient','name',v)} maxLength={100}/>
     <DeliveryField label={step===0?'Sender phone':'Recipient phone'} type="tel" value={form[step===0?'sender':'recipient'].phone} onChange={v=>change(step===0?'sender':'recipient','phone',v)} maxLength={20}/>
     {step===1&&<p className="small muted">{t('No recipient account is needed. Share a private confirmation link after booking. This does not verify phone ownership.')}</p>}
     <DeliveryField label={step===0?'Pickup instructions':'Delivery instructions'} value={form[step===0?'sender':'recipient'].instructions} onChange={v=>change(step===0?'sender':'recipient','instructions',v)} maxLength={500} required={false}/>
     {step===0&&<DeliveryField label="Region" value={form.region} onChange={v=>setForm(f=>({...f,region:v}))} options={config.general.regions}/>}
    </>}
    {step===2&&<><DeliveryField label="Package category" options={config.packages.categories} value={form.package.category} onChange={v=>change('package','category',v)}/><DeliveryField label="Package size" options={['small','medium','large']} value={form.package.size} onChange={v=>change('package','size',v)}/>
     <div className="delivery-grid">{[['weight','Weight (kg)','maxWeight'],['length','Length (cm)','maxLength'],['width','Width (cm)','maxWidth'],['height','Height (cm)','maxHeight']].map(([key,label,max])=><DeliveryField key={key} label={label} type="number" min="0.1" step="0.1" max={config.packages[max]} value={form.package[key]} onChange={v=>change('package',key,v)}/>)}</div>
     <DeliveryField label="Package description" value={form.package.description} onChange={v=>change('package','description',v)} maxLength={500}/><DeliveryField label="Special handling" value={form.package.handling} onChange={v=>change('package','handling',v)} maxLength={500} required={false}/>
     <label className="delivery-field">{t('Package photo (optional)')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)run(async()=>{const photo=await uploadDeliveryImage(file,'package');change('package','photoId',photo.id);});}}/></label>{form.package.photoId&&<img className="delivery-photo" src={'/api/deliveries/evidence/'+form.package.photoId} alt={t('Package')}/>}
     <p className="small">{t(config.packages.handling)}</p><p className="small"><strong>{t('Prohibited items')}: </strong>{config.packages.prohibited.map(v=>t(v)).join('، ')}</p><label className="flex gap-2"><input type="checkbox" required checked={form.acknowledged} onChange={e=>setForm(f=>({...f,acknowledged:e.target.checked}))}/>{t('I confirm this package contains no prohibited items.')}</label>
    </>}
    {step>=3&&estimate&&<><dl className="delivery-price">{[['base','Base fee'],['distance','Distance fee'],['vehicle','Vehicle surcharge'],['size','Package surcharge'],['total','Total']].map(([key,label])=><div key={key}><dt>{t(label)}</dt><dd><bdi>{deliveryMoney(estimate.quote[key])}</bdi></dd></div>)}</dl><p>{new Intl.NumberFormat(customerLocale(),{maximumFractionDigits:1}).format(estimate.route.distanceMeters/1000)} {t('km')} · {Math.ceil(estimate.route.durationSeconds/60)} {t('min')}</p><p>{t('Vehicle')}: {estimate.vehicleTypes.map(v=>t(v)).join(' · ')}</p><p className="muted">{estimate.pickupETA?t(`Estimated pickup: ${estimate.pickupETA} min`):t('Pickup time is confirmed after a courier accepts.')}</p><p>{t('Waiting fee')}: <bdi>{deliveryMoney(config.pricing.waitingPerMinute)}</bdi> / {t('min')} ({config.pricing.waitingFreeMinutes} {t('free minutes')})</p><p>{t('Cancellation fee')}: <bdi>{deliveryMoney(config.pricing.cancellation)}</bdi></p><p>{t('EGP wallet payment')}</p></>}
    {step===4&&<div className="delivery-summary"><p><strong>{t('Pickup')}:</strong> <bdi>{form.pickup.address}</bdi></p><p><strong>{t('Dropoff')}:</strong> <bdi>{form.dropoff.address}</bdi></p><p><bdi>{form.sender.name}</bdi> → <bdi>{form.recipient.name}</bdi></p><p>{t(form.package.size)} · <bdi>{form.package.description}</bdi></p></div>}
    <div className="flex gap-2 mt-4">{step>0&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>setStep(s=>s-1)}><ArrowLeft className="directional" size={16}/>{t('Back')}</button>}<button className="btn btn-primary" disabled={busy}>{step===4?<CheckCircle2 size={17}/>:<ArrowRight className="directional" size={17}/>} {t(busy?'Submitting…':step===4?'Confirm delivery request':'Next')}</button></div>
   </form><div className="delivery-booking-map"><div className="card card-pad mb-3 delivery-route-preview" aria-live="polite" data-testid="delivery-route-preview">{routing?<p>{t('Calculating road route…')}</p>:preview&&<p>{new Intl.NumberFormat(customerLocale(),{maximumFractionDigits:1}).format(preview.distanceMeters/1000)} {t('km')} · {Math.ceil(preview.durationSeconds/60)} {t('min')}</p>}{routeError&&<><p role="alert">{t(routeError)}</p><button type="button" className="btn btn-secondary" onClick={()=>setRouteRetry(n=>n+1)}>{t('Retry route')}</button></>}</div><MapView pickup={form.pickup} dropoff={form.dropoff} routeGeometry={preview?.geometry} fit onClick={point=>{if(step<2){const key=step===0?'pickup':'dropoff',address=`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;setForm(f=>({...f,[key]:{...point,address}}));setTexts(v=>({...v,[key]:address}));}}}/></div></div>
  </>}
 </div>;
}
