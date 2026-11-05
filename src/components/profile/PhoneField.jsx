'use client';
import {useId,useMemo} from 'react';
import {useI18n} from '@/context/LanguageProvider';
import {t} from '@/lib/i18n';
import {phoneCountries,getCountryCallingCode,mobileContact} from '@/lib/contact-phone';

export default function PhoneField({label='Phone number',countryLabel='Phone country',value='',country='',onChange,required=true,disabled=false}){
 const {language}=useI18n(),id=useId(),result=mobileContact(value,country);
 const options=useMemo(()=>{const names=new Intl.DisplayNames([language||'en'],{type:'region'});return phoneCountries.map(code=>({code,label:`${names.of(code)} (\u2066+${getCountryCallingCode(code)}\u2069)`})).sort((a,b)=>a.label.localeCompare(b.label,language));},[language]);
 const message=(!required&&!value)?'':result.error;
 return <div className="mb-3" style={{minWidth:0}}>
  <label className="delivery-field"><span>{t(countryLabel)}</span><select className="input" aria-label={t(countryLabel)} value={result.phoneCountry||country} disabled={disabled||!!(value.trim().startsWith('+')&&result.phoneCountry)} onChange={e=>onChange({phone:value,phoneCountry:e.target.value})}><option value="">{t('Choose country code')}</option>{options.map(o=><option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
  {value.trim().startsWith('+')&&result.phoneCountry&&<p className="small muted">{t('The international prefix determines the phone country.')}</p>}
  <label className="delivery-field"><span>{t(label)}</span><input className="input" type="tel" autoComplete="tel" aria-label={t(label)} dir="ltr" value={value} disabled={disabled} maxLength={40} aria-invalid={!!message} aria-describedby={message?id:undefined} onChange={e=>onChange({phone:e.target.value,phoneCountry:mobileContact(e.target.value).phoneCountry||country})}/></label>
  {message&&<p id={id} className="settings-error" aria-live="polite">{t(message)}</p>}
 </div>;
}
