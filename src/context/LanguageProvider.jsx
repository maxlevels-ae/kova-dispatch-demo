'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {useSession} from 'next-auth/react';
import {setClientLanguage,t} from '@/lib/i18n';
const Context=createContext({language:'en',save:async()=>{}});
export function LanguageProvider({children}){
 const {data:session}=useSession(),id=session?.user?.id,role=session?.user?.role;
 const [language,setLanguage]=useState('en');
 const apply=value=>{setClientLanguage(value);setLanguage(value);document.documentElement.lang=value;document.documentElement.dir=value==='ar'?'rtl':'ltr';};
 useEffect(()=>{let active=true;if(role!=='rider'){apply('en');return;}
  fetch('/api/me/language').then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(active)apply(d.language);}).catch(()=>{});return()=>{active=false;};
 },[id,role]);
 const save=async value=>{const r=await fetch('/api/me/language',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:value})});const d=await r.json();if(!r.ok)throw Error(d.error);apply(d.language);};
 return <Context.Provider value={{language,save,t}}>{children}</Context.Provider>;
}
export const useI18n=()=>useContext(Context);
