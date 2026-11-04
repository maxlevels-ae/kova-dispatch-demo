'use client';
import {useState} from 'react';
export default function VehiclePhotoUpload({userId,imageUrl,onSaved}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function upload(e){const file=e.target.files?.[0];if(!file)return;setMessage('');if(file.size>2*1024*1024){setMessage('Vehicle image must be at most 2 MB');return;}setBusy(true);try{const image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});const r=await fetch('/api/drivers/'+userId+'/vehicle-photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});const d=await r.json();if(!r.ok)throw Error(d.error);onSaved?.(d.imageUrl);setMessage('Vehicle photo saved successfully');}catch(e){setMessage(e.message||'Upload failed');}finally{setBusy(false);}}
 return <div className="vehicle-photo-upload">{imageUrl&&<img src={imageUrl} alt="Current vehicle" style={{width:160,height:100,objectFit:'cover',borderRadius:12}}/>}<label className="label">Vehicle photo<input className="input" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload}/></label><p className="tiny muted">PNG, JPEG or WebP, up to 2 MB. Stored securely with your vehicle.</p><p role="status">{busy?'Uploading…':message}</p></div>;
}
