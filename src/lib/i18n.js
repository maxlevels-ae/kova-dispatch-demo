import {arabic} from './locales/ar';
let currentLanguage='en';
const patterns=Object.entries(arabic).filter(([english])=>english.includes('{')).sort(([a],[b])=>b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length).map(([english,translated])=>({pattern:new RegExp('^'+english.split(/\{\d+\}/).map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.+?)')+'$'),translated}));
export function setClientLanguage(value){if(typeof window!=='undefined')currentLanguage=value==='ar'?'ar':'en';}
export function customerLocale(){return currentLanguage==='ar'?'ar-EG':'en-EG';}
export function translate(value,language=currentLanguage){
 if(typeof value==='number'&&language==='ar')return new Intl.NumberFormat('ar-EG').format(value);
 if(typeof value!=='string'||language!=='ar')return value;
 const text=value.trim();if(Object.hasOwn(arabic,text))return arabic[text];
 for(const {pattern,translated} of patterns){
  const match=text.match(pattern);
  if(match)return translated.replace(/\{(\d+)\}/g,(_,i)=>'\u2068'+match[Number(i)+1]+'\u2069');
 }
 return value;
}
export const t=translate;
