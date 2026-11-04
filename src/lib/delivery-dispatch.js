import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Delivery from '@/lib/db/models/Delivery';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import redis from '@/lib/db/redis';
import connectDB from '@/lib/db/mongodb';
import {walletAccount,walletDelta} from '@/lib/currency';
import {deliveryNotify} from '@/lib/delivery-service';
export async function dispatchDeliveries(){
 await connectDB();const token=crypto.randomUUID();if(!await redis.set('delivery:dispatch:lock',token,'EX',60,'NX'))return;
 try{
  const orders=await Delivery.find({status:'SEARCHING_COURIER'}).sort({createdAt:1}).limit(20);
  for(const order of orders){
   if(order.offer?.expiresAt>new Date())continue;
   if(order.offer?.id){await Delivery.updateOne({_id:order._id,status:order.status,'offer.id':order.offer.id},{$unset:{offer:1},$push:{timeline:{status:order.status,event:'offer_expired',at:new Date(),actorId:order.offer.courierId,role:'system'}}});}
   if(order.manualHold)continue;
   const s=order.policy;
   const candidates=s.eligibility.available&&order.attempts<s.dispatch.maxAttempts?await Driver.aggregate([{$geoNear:{near:{type:'Point',coordinates:[order.pickup.lng,order.pickup.lat]},distanceField:'meters',maxDistance:s.dispatch.radiusKm*1000,spherical:true,query:{_id:{$nin:order.attempted},isOnline:true,isApproved:true,currentRideId:null,currentDeliveryId:null,'services.deliveries':true,'vehicle.type':{$in:s.eligibility.vehicles},lastLocationUpdate:{$gt:new Date(Date.now()-90000)},...(s.eligibility.requireLicense?{'license.verified':true}:{})}}},{$limit:10}]):[];
   let driver;
   for(const c of candidates){const u=await User.findById(c.userId).select('isActive wallet egpWallet').lean();if(u?.isActive&&walletAccount(u)?.currency==='EGP'&&walletAccount(u).balance>=0){driver=c;break;}}
   if(!driver){
    const closed=await mongoose.connection.transaction(async session=>{
     const current=await Delivery.findOne({_id:order._id,status:'SEARCHING_COURIER'}).session(session);if(!current)return null;
     const updated=await User.findByIdAndUpdate(current.customerId,walletDelta(current.quote.total,'EGP'),{session,returnDocument:'after',updatePipeline:true});
     await WalletTransaction.create([{userId:current.customerId,type:'refund',amount:current.quote.total,currency:'EGP',balanceAfter:walletAccount(updated).balance,deliveryId:current._id,ref:`delivery:${current._id}:refund`,note:'No courier — delivery refund'}],{session});
     current.status='NO_COURIER';current.offer=undefined;current.settlement={status:'refunded',at:new Date()};current.timeline.push({status:current.status,event:'no_eligible_courier',role:'system'});await current.save({session});return current;
    });if(closed)await deliveryNotify(closed,closed.status,closed.timeline.at(-1)._id);continue;
   }
   const offer={id:crypto.randomUUID(),courierId:driver.userId,profileId:driver._id,expiresAt:new Date(Date.now()+s.dispatch.acceptanceSeconds*1000)};
   const updated=await Delivery.findOneAndUpdate({_id:order._id,status:'SEARCHING_COURIER',attempts:order.attempts},{$set:{offer},$inc:{attempts:1},$push:{attempted:driver._id,timeline:{status:'SEARCHING_COURIER',event:'offer_sent',actorId:driver.userId,role:'system',at:new Date(),note:offer.id}}},{returnDocument:'after'});
   if(updated)await deliveryNotify(updated,'offer',offer.id);
  }
 }finally{await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,'delivery:dispatch:lock',token);}
}
export function startDeliveryWorker(){
 if(global.__deliveryWorker)return;
 let running=false,tick=0;
 global.__deliveryWorker=setInterval(async()=>{if(running)return;running=true;try{await dispatchDeliveries();
  if(++tick%10===0){const orders=await Delivery.find({updatedAt:{$gt:new Date(Date.now()-3600000)}}).limit(50);for(const order of orders){for(const event of order.timeline.filter(e=>e.event==='transition'||e.event==='courier_accepted'))await deliveryNotify(order,event.status,event._id);for(const m of order.messages.slice(-20))await deliveryNotify(order,'message',m.clientId,m.senderId);}}
 }catch(e){console.error('Delivery worker unavailable',e.name);}finally{running=false;}},3000);
 global.__deliveryWorker.unref?.();
}
