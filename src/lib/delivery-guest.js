import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Delivery from '@/lib/db/models/Delivery';
import redis from '@/lib/db/redis';
import connectDB from '@/lib/db/mongodb';
import {DeliveryError,loadDelivery,deliveryView,generateCode,decryptCode} from '@/lib/delivery-service';
import {terminalDeliveryStates} from '@/lib/delivery-policy';

const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export async function guestLimit(key,maximum,seconds=60){
 const name='delivery:guest:'+digest(key),count=await redis.incr(name);
 if(count===1)await redis.expire(name,seconds);
 if(count>maximum)throw new DeliveryError('Too many requests. Please try again later.',429);
}
// Only the sender can issue a bearer link. The raw token is returned once and
// belongs in a URL fragment, never a path/query string, notification or audit.
export async function manageGuestLink(id,user,revoke=false){
 const initial=await loadDelivery(id,user);
 if(String(initial.customerId)!==user.id||initial.recipientId)throw new DeliveryError('Forbidden',403);
 await guestLimit('issue:'+id,5,900);
 const token=crypto.randomBytes(32).toString('base64url');
 const expiresAt=new Date(Date.now()+Math.min(60,initial.policy.proof.expiryMinutes)*60000);
 await mongoose.connection.transaction(async session=>{
  const order=await Delivery.findById(id).session(session);
  if(terminalDeliveryStates.includes(order.status))throw new DeliveryError('This delivery is closed');
  order.guestAccess={hash:revoke?undefined:digest(token),expiresAt,revokedAt:revoke?new Date():undefined};
  // Revocation/renewal invalidates previously revealed and verified codes too.
  order.deliveryCode=generateCode(Math.min(60,order.policy.proof.expiryMinutes));
  order.timeline.push({status:order.status,event:revoke?'guest_link_revoked':'guest_link_issued',actorId:user.id,role:user.role,note:'Private link; phone ownership not verified'});
  await order.save({session});
 });
 return revoke?{revoked:true}:{token,expiresAt};
}
export async function guestDelivery(id,token){
 if(!mongoose.isValidObjectId(id)||!/^[-_a-zA-Z0-9]{43}$/.test(token||''))throw new DeliveryError('Recipient link is invalid, expired or revoked.',401);
 await guestLimit('read:'+digest(token),60);
 await connectDB();
 const order=await Delivery.findOne({_id:id,recipientId:null,'guestAccess.hash':digest(token),'guestAccess.expiresAt':{$gt:new Date()},'guestAccess.revokedAt':null}).select('+deliveryCode.cipher');
 if(!order)throw new DeliveryError('Recipient link is invalid, expired or revoked.',401);
 const view=await deliveryView(order,{id:'guest',role:'guest'}),closed=terminalDeliveryStates.includes(order.status);
 // Deliberate allow-list: no sender, contact phone, pickup, messages, evidence,
 // finances, database user IDs or internal operational timeline.
 return {reference:String(order._id),status:order.status,verificationMethod:'private_link',expiresAt:order.guestAccess.expiresAt,
  dropoff:{lat:order.dropoff.lat,lng:order.dropoff.lng,address:order.dropoff.address},
  courier:view.courier?{name:view.courier.name,location:['IN_TRANSIT','AT_DROPOFF'].includes(order.status)?view.courier.location:null}:null,
  vehicle:view.vehicle?{make:view.vehicle.make,model:view.vehicle.model,color:view.vehicle.color,plate:view.vehicle.plate}:null,
  confirmedAt:order.proof?.confirmedAt||null,
  code:!closed&&!order.deliveryCode.verifiedAt&&order.deliveryCode.expiresAt>new Date()?decryptCode(order.deliveryCode.cipher):null};
}
