// Currency minor units follow ISO 4217; no exchange rates are defined.
import {egyptLocations} from './map-config';
export const currencyDigits={USD:2,EGP:2,JOD:3,IQD:3};
export const countries={
 EG:{code:'EG',name:'Egypt',arabic:'مصر',currency:'EGP',minorUnits:2,timeZone:'Africa/Cairo',dialCode:'+20',center:{lat:30.0444,lng:31.2357},cities:[{name:'Cairo',province:'Cairo',lat:30.0444,lng:31.2357},{name:'Alexandria',province:'Alexandria',lat:31.2001,lng:29.9187},{name:'Giza',province:'Giza',lat:30.0131,lng:31.2089}]},
 JO:{code:'JO',name:'Jordan',arabic:'الأردن',currency:'JOD',minorUnits:3,timeZone:'Asia/Amman',dialCode:'+962',center:{lat:31.9539,lng:35.9106},cities:[{name:'Amman',province:'Amman',lat:31.9539,lng:35.9106},{name:'Irbid',province:'Irbid',lat:32.5556,lng:35.85},{name:'Zarqa',province:'Zarqa',lat:32.0728,lng:36.088},{name:'Aqaba',province:'Aqaba',lat:29.5321,lng:35.0063}]},
 IQ:{code:'IQ',name:'Iraq',arabic:'العراق',currency:'IQD',minorUnits:3,timeZone:'Asia/Baghdad',dialCode:'+964',center:{lat:33.3152,lng:44.3661},cities:[{name:'Baghdad',province:'Baghdad',lat:33.3152,lng:44.3661},{name:'Basra',province:'Basra',lat:30.5085,lng:47.7804},{name:'Erbil',province:'Erbil',lat:36.1911,lng:44.0092},{name:'Mosul',province:'Nineveh',lat:36.335,lng:43.1189}]},
};
countries.EG.cities=Object.entries(egyptLocations).flatMap(([province,locations])=>Object.entries(locations).map(([name,[lat,lng]])=>({name,province,lat,lng})));
export function validCountryPhone(phone,code){const digits=String(phone||'').replace(/[ ()-]/g,'');return ({EG:/^(?:\+20|0)1[0125]\d{8}$/,JO:/^(?:\+962|0)7[789]\d{7}$/,IQ:/^(?:\+964|0)7[3-9]\d{8}$/})[code]?.test(digits)||false;}
export function operationalCircle(center,radiusKm=50){const points=Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return [center.lng+Math.cos(a)*radiusKm/(111.32*Math.cos(center.lat*Math.PI/180)),center.lat+Math.sin(a)*radiusKm/111.32];});return {type:'Polygon',coordinates:[[...points,points[0]]]};}
