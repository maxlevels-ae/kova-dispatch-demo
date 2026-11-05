'use client';
import {t as tr,customerLocale} from '@/lib/i18n';
import {useI18n} from '@/context/LanguageProvider';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Bell,X} from 'lucide-react';
import {useNotifications} from '@/context/NotificationProvider';
import NotificationControls from './NotificationControls';
import {safeNotificationLink} from '@/lib/notification-policy';
export default function NotificationInbox({initiallyOpen=false,prototype=false}){
  useI18n();
 const n=useNotifications(),ref=useRef(null);const [error,setError]=useState('');
 useEffect(()=>{if(initiallyOpen&&ref.current)ref.current.open=true;},[initiallyOpen]);
 if(!n)return null;
 const close=()=>{ref.current.open=false;ref.current.querySelector('summary').focus();};
 return <details ref={ref} className="notification-inbox" onKeyDown={e=>{if(e.key==='Escape')close();}}>
  <summary className="btn btn-ghost notification-trigger" aria-label={tr("Notifications")} onClick={()=>n.refresh()}>{prototype?<img src="/rider-assets/icons/bell.svg" width="24" height="24" alt=""/>:<Bell size={18}/>}<span>{tr("Notifications")}</span>{n.unread>0&&<span className="badge badge-neutral" aria-label={tr("Unread notifications")}>{tr(n.unread)}</span>}</summary>
  <div className="notification-panel card" role="region" aria-label={tr("Notification inbox")}>
   <div className="flex justify-between items-center mb-3"><strong>{tr("Notifications")}</strong><button className="btn btn-ghost btn-icon" aria-label={tr("Close notifications")} onClick={close}><X size={16}/></button></div>
   <NotificationControls/>
   <p role="status">{tr(error||n.error)}</p>
   <div className="flex gap-2"><button className="btn btn-secondary btn-sm" onClick={n.refresh}>{tr("Refresh")}</button><button className="btn btn-secondary btn-sm" disabled={!n.unread} onClick={()=>n.markRead().catch(e=>setError(e.message))}>{tr("Mark all read")}</button></div>
   {!n.items.length&&<p>{tr("No notifications yet.")}</p>}
   {n.items.map(item=><article className="mt-3" key={item._id}><Link href={safeNotificationLink(item.href)} onClick={()=>{n.markRead(item._id).catch(e=>setError(e.message));ref.current.open=false;}}><strong>{tr(!item.readAt?'• ':'')}{' '}{item.text}</strong></Link><p className="tiny muted">{tr(new Date(item.createdAt).toLocaleString(customerLocale()))}{' '}{tr(item.pushStatus==='failed'?' · Push delivery failed':'')}</p></article>)}
  </div>
 </details>;
}
