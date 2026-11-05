'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useI18n} from '@/context/LanguageProvider';
import {t} from '@/lib/i18n';
import NotificationInbox from '@/components/NotificationInbox';
import {riderAsset} from './reference-values';
const links=[['/dashboard','Home','home'],['/rides','Trips','clock'],['/wallet','Wallet','wallet'],['/profile','Account','user']];
export default function RiderShell({children}){
 const path=usePathname();useI18n();
 return <div className="rider-app">{path==='/dashboard'?children:<><main className="reference-subpage"><header><Link className="reference-back" href="/dashboard" aria-label={t('Home')}><img src={riderAsset('icons/back.svg')} alt=""/>Maxride</Link><NotificationInbox prototype/></header>{path==='/rides'&&<Link className="btn btn-secondary" href="/deliveries">{t('Deliveries')}</Link>}{children}</main><nav className="reference-nav" aria-label={t('Main')}>{links.map(([href,label,icon])=><Link href={href} key={href} aria-current={path.startsWith(href)?'page':undefined}><img src={riderAsset('icons/'+icon+'.svg')} alt=""/>{t(label)}</Link>)}</nav></>}</div>;
}
