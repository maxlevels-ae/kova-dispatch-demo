// Currency minor units follow ISO 4217; no exchange rates are defined.
import catalog from './geography/catalog.json' with {type:'json'};
import digits from './geography/currency-digits.json' with {type:'json'};
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {egyptLocations} from './map-config';
export const currencyDigits=digits;
export const countries={
 EG:{code:'EG',name:'Egypt',arabic:'مصر',currency:'EGP',minorUnits:2,timeZone:'Africa/Cairo',dialCode:'+20',center:{lat:30.0444,lng:31.2357},cities:[{name:'Cairo',province:'Cairo',lat:30.0444,lng:31.2357},{name:'Alexandria',province:'Alexandria',lat:31.2001,lng:29.9187},{name:'Giza',province:'Giza',lat:30.0131,lng:31.2089}]},
 JO:{code:'JO',name:'Jordan',arabic:'الأردن',currency:'JOD',minorUnits:3,timeZone:'Asia/Amman',dialCode:'+962',center:{lat:31.9539,lng:35.9106},cities:[{name:'Amman',province:'Amman',lat:31.9539,lng:35.9106},{name:'Irbid',province:'Irbid',lat:32.5556,lng:35.85},{name:'Zarqa',province:'Zarqa',lat:32.0728,lng:36.088},{name:'Aqaba',province:'Aqaba',lat:29.5321,lng:35.0063}]},
 IQ:{code:'IQ',name:'Iraq',arabic:'العراق',currency:'IQD',minorUnits:3,timeZone:'Asia/Baghdad',dialCode:'+964',center:{lat:33.3152,lng:44.3661},cities:[{name:'Baghdad',province:'Baghdad',lat:33.3152,lng:44.3661},{name:'Basra',province:'Basra',lat:30.5085,lng:47.7804},{name:'Erbil',province:'Erbil',lat:36.1911,lng:44.0092},{name:'Mosul',province:'Nineveh',lat:36.335,lng:43.1189}]},
};
countries.EG.cities=Object.entries(egyptLocations).flatMap(([province,locations])=>Object.entries(locations).map(([name,[lat,lng]])=>({name,province,lat,lng})));
for(const [code,entry] of Object.entries(catalog))if(!countries[code])countries[code]=entry;
for(const c of Object.values(countries)){const existing=new Set(c.cities.map(v=>v.name));for(const city of catalog[c.code].cities)if(!existing.has(city.name)){c.cities.push(city);existing.add(city.name);}for(const city of c.cities){const entry=catalog[c.code].cities.find(v=>v.name===city.name);if(entry?.arabic)city.arabic=entry.arabic;}c.provinces??=catalog[c.code].provinces;}
export const countryCodes=Object.keys(countries);
export function countryForConfig(code,config){const c=countries[code];if(!c)return null;const currency=code==='PS'?config?.settlementCurrency:c.currency;return {...c,currency:currency||null,minorUnits:currencyDigits[currency]??null};}
export function validCountryPhone(phone,code){try{const p=parsePhoneNumberFromString(String(phone||''),{defaultCountry:code,extract:false});return !!p&&p.country===code&&p.isValid()&&['MOBILE','FIXED_LINE_OR_MOBILE'].includes(p.getType());}catch{return false;}}
export function formatCountryPhone(phone,code){try{return parsePhoneNumberFromString(String(phone||''),code)?.formatInternational()||phone;}catch{return phone;}}
export function countryName(code,language='en'){return language==='ar'?countries[code]?.arabic:countries[code]?.name;}
export function operationalCircle(center,radiusKm=50){const points=Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return [center.lng+Math.cos(a)*radiusKm/(111.32*Math.cos(center.lat*Math.PI/180)),center.lat+Math.sin(a)*radiusKm/111.32];});return {type:'Polygon',coordinates:[[...points,points[0]]]};}
