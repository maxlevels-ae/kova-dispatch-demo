'use client';
import {useState} from 'react';
import {CheckCircle2} from 'lucide-react';
import {useI18n} from '@/context/LanguageProvider';
import {t} from '@/lib/i18n';
export default function LanguageSetting(){const {language,save}=useI18n();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);return <section className="card card-pad mt-4"><h2>{t('Language')}</h2><label className="delivery-field"><span>{t('Language')}</span><select className="input" aria-label={t('Language')} value={language} disabled={busy} onChange={async e=>{setBusy(true);setError('');setSaved(false);try{await save(e.target.value);setSaved(true);}catch(e){setError(e.message);}finally{setBusy(false);}}}><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option></select></label>{error&&<p role="alert">{t(error)}</p>}{saved&&<p role="status" aria-live="polite"><CheckCircle2 size={17}/> {t('Settings saved successfully')}</p>}</section>;}
