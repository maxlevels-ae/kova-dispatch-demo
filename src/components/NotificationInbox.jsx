'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {Bell,X} from 'lucide-react';
import {useNotifications} from '@/context/NotificationProvider';
import NotificationControls from './NotificationControls';
import {safeNotificationLink} from '@/lib/notification-policy';
export default function NotificationInbox(){
 const n=useNotifications(),ref=useRef(null);const [error,setError]=useState('');
 if(!n)return null;
 const close=()=>{ref.current.open=false;ref.current.querySelector('summary').focus();};
 return <details ref={ref} className="notification-inbox" onKeyDown={e=>{if(e.key==='Escape')close();}}>
  <summary className="btn btn-ghost notification-trigger" aria-label="Notifications" onClick={()=>n.refresh()}><Bell size={18}/><span>Notifications</span>{n.unread>0&&<span className="badge badge-neutral" aria-label="Unread notifications">{n.unread}</span>}</summary>
  <div className="notification-panel card" role="region" aria-label="Notification inbox">
   <div className="flex justify-between items-center mb-3"><strong>Notifications</strong><button className="btn btn-ghost btn-icon" aria-label="Close notifications" onClick={close}><X size={16}/></button></div>
   <NotificationControls/>
   <p role="status">{error||n.error}</p>
   <div className="flex gap-2"><button className="btn btn-secondary btn-sm" onClick={n.refresh}>Refresh</button><button className="btn btn-secondary btn-sm" disabled={!n.unread} onClick={()=>n.markRead().catch(e=>setError(e.message))}>Mark all read</button></div>
   {!n.items.length&&<p>No notifications yet.</p>}
   {n.items.map(item=><article className="mt-3" key={item._id}><Link href={safeNotificationLink(item.href)} onClick={()=>{n.markRead(item._id).catch(e=>setError(e.message));ref.current.open=false;}}><strong>{!item.readAt?'• ':''}{item.text}</strong></Link><p className="tiny muted">{new Date(item.createdAt).toLocaleString()}{item.pushStatus==='failed'?' · Push delivery failed':''}</p></article>)}
  </div>
 </details>;
}
