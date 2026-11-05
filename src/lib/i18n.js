import {arabic} from './locales/ar';
import {countries} from './countries';
const deliveryLabels={CREATED:'Order created',SEARCHING_COURIER:'Finding a courier',COURIER_ASSIGNED:'Courier assigned',COURIER_ARRIVING:'Courier heading to pickup',AT_PICKUP:'Courier arrived',PICKED_UP:'Package picked up',IN_TRANSIT:'On the way to recipient',AT_DROPOFF:'Courier at destination',DELIVERED:'Delivered',NO_COURIER:'No courier available',DELIVERY_FAILED:'Delivery problem',RETURN_REQUESTED:'Return requested',RETURNED:'Returned'};
const placeTranslations=new Map(Object.values(countries).flatMap(c=>[[c.name,c.arabic],...c.cities.filter(v=>v.arabic).map(v=>[v.name,v.arabic])]));
let currentLanguage='en';
let currentCountry='EG';
export function setClientCountry(code){if(typeof window!=='undefined'&&countries[code])currentCountry=code;}
export function customerTimeZone(){return countries[currentCountry].timeZone;}
const patterns=Object.entries(arabic).filter(([english])=>english.includes('{')).sort(([a],[b])=>b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length).map(([english,translated])=>({pattern:new RegExp('^'+english.split(/\{\d+\}/).map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.+?)')+'$'),translated}));
export function setClientLanguage(value){if(typeof window!=='undefined')currentLanguage=value==='ar'?'ar':'en';}
export function customerLocale(){return currentLanguage+'-'+currentCountry;}
export function translate(value,language=currentLanguage){
 if(typeof value==='number'&&language==='ar')return new Intl.NumberFormat(customerLocale()).format(value);
 if(typeof value!=='string'||language!=='ar')return typeof value==='string'?(deliveryLabels[value]||value):value;
 const text=value.trim();if(!Object.hasOwn(arabic,text)&&placeTranslations.has(text))return placeTranslations.get(text);if(Object.hasOwn(arabic,text))return arabic[text];
 for(const {pattern,translated} of patterns){
  const match=text.match(pattern);
  if(match)return translated.replace(/\{(\d+)\}/g,(_,i)=>'\u2068'+match[Number(i)+1]+'\u2069');
 }
 return value;
}
export const t=translate;
