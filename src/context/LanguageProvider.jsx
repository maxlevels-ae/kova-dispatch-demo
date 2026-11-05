'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {useSession} from 'next-auth/react';
import {setClientLanguage,setClientCountry,t} from '@/lib/i18n';
const Context=createContext({language:'en',save:async()=>{}});
export function LanguageProvider({children}){
 const {data:session}=useSession(),id=session?.user?.id,role=session?.user?.role;
 const [language,setLanguage]=useState('en');
 const [country,setCountry]=useState('EG');
 useEffect(()=>{if(!id)return;let active=true;const load=()=>fetch('/api/services').then(r=>r.ok?r.json():null).then(d=>{if(active&&d?.country){setClientCountry(d.country.code);setCountry(d.country.code);}}).catch(()=>{});load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('maxride:maps-saved',load);window.addEventListener('storage',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('maxride:maps-saved',load);window.removeEventListener('storage',load);};},[id]);
 const apply=value=>{setClientLanguage(value);setLanguage(value);document.documentElement.lang=value;document.documentElement.dir=value==='ar'?'rtl':'ltr';};
 useEffect(()=>{let active=true;if(role!=='rider'){apply('en');return;}
  fetch('/api/me/language').then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(active)apply(d.language);}).catch(()=>{});return()=>{active=false;};
 },[id,role]);
 const save=async value=>{const r=await fetch('/api/me/language',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:value})});const d=await r.json();if(!r.ok)throw Error(d.error);apply(d.language);};
 return <Context.Provider value={{language,country,save,t}}>{children}</Context.Provider>;
}
export const useI18n=()=>useContext(Context);
