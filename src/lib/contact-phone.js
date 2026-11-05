import {getCountries,getCountryCallingCode,parsePhoneNumberFromString} from 'libphonenumber-js/max';

// Contact nationality is independent of the administrator's operating country.
export const phoneCountries=getCountries();
export {getCountryCallingCode};
export function mobileContact(value,country=''){
 const text=String(value||'').trim();
 if(!text)return {error:'Phone number invalid'};
 if(!text.startsWith('+')&&!phoneCountries.includes(country))return {error:'Country code required'};
 try{
  const phone=parsePhoneNumberFromString(text,{...(text.startsWith('+')?{}:{defaultCountry:country}),extract:false});
  if(!phone?.country||!phoneCountries.includes(phone.country)||phone.ext||!phone.isValid()||!['MOBILE','FIXED_LINE_OR_MOBILE'].includes(phone.getType()))return {error:'Phone number invalid'};
  return {phone:phone.number,phoneCountry:phone.country};
 }catch{return {error:'Phone number invalid'};}
}
