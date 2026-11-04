import webpush from 'web-push';
import PushSubscription from './db/models/PushSubscription';
import User from './db/models/User';
import {safeNotificationLink} from './notification-policy';
export function pushConfiguration(){
 const enabled=Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
 return {enabled,publicKey:enabled?process.env.VAPID_PUBLIC_KEY:null};
}
export function validPushEndpoint(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(
 u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com'));
 }catch{return false;}
}
export async function sendPush(notification){
 if(!pushConfiguration().enabled)return {pushStatus:'disabled'};
 const user=await User.findById(notification.userId).select('isActive').lean();
 if(!user?.isActive)return {pushStatus:'suppressed'};
 const subscriptions=await PushSubscription.find({userId:notification.userId,expiresAt:{$gt:new Date()}}).select('+endpoint +keys.p256dh +keys.auth');
 if(!subscriptions.length)return {pushStatus:'unsubscribed'};
 let failed=false;
 for(const sub of subscriptions){
  try{
   if(!validPushEndpoint(sub.endpoint))throw Error('Invalid endpoint');
   await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}},JSON.stringify({id:String(notification._id),title:'Maxride',body:notification.text,href:safeNotificationLink(notification.href),expiresAt:notification.expiresAt}),{
    TTL:notification.event==='booking_offer'?20:300,timeout:8000,
    vapidDetails:{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY},
   });
   sub.lastError=undefined;await sub.save();
  }catch(e){failed=true;if([404,410].includes(e.statusCode))await sub.deleteOne();else{sub.lastError='Push service delivery failed';await sub.save();}}
 }
 return {pushStatus:failed?'failed':'sent',pushError:failed?'One or more push deliveries failed':undefined};
}
