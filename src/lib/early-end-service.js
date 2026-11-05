import mongoose from 'mongoose';
import {z} from 'zod';
import Ride from '@/lib/db/models/Ride';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import Payment from '@/lib/db/models/Payment';
import TripEvent from '@/lib/db/models/TripEvent';
import AdminAudit from '@/lib/db/models/AdminAudit';
import {tripEvidence,latestFix} from './ride-safety';
import {earlyReasons,validFix} from './ride-safety-policy';
import {walletAccount,walletDelta,minorUnits} from './currency';
import {currencyDigits} from './countries';
import redis from './db/redis';
import {emitToRide,emitToAdmin,leaveRideRoom} from './realtime/emit';
import {notifyRideParticipants} from './notifications';
import connectDB from './db/mongodb';
export class EarlyEndError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const requestSchema=z.object({reason:z.enum(earlyReasons),requestedBy:z.enum(['rider','driver','both','unknown']),explanation:z.string().trim().max(1000).default('')}).strict().refine(v=>v.reason!=='other'||v.explanation.length>=10,'Explain the other reason (at least 10 characters)');
const round=(n,c)=>minorUnits(n,c)/10**currencyDigits[c];
async function announce(ride,ended=false){if(ended)emitToRide(String(ride._id),'ride:ended-early',{rideId:String(ride._id),earlyEnd:ride.earlyEnd});emitToAdmin('ride:updated',{rideId:String(ride._id),status:ride.status});await notifyRideParticipants(ride);}
export async function endRideEarly(id,user,body){
 const parsed=requestSchema.safeParse(body);if(!parsed.success)throw new EarlyEndError(parsed.error.issues[0].message,400);
 await connectDB();
 const ride=await mongoose.connection.transaction(async session=>{
  const r=await Ride.findOne({_id:id,driverId:user.id}).session(session);if(!r)throw new EarlyEndError('Ride not found',404);
  if(r.status==='ended_early')return r;if(r.status!=='in_progress')throw new EarlyEndError('Only an active trip may end early');
  const evidence=await tripEvidence(r,session),lastFix=await latestFix(r,session),p=parsed.data;
  const riderRequested=['rider_requested','destination_changed','wrong_destination'].includes(p.reason)&&['rider','both'].includes(p.requestedBy);
  const usable=evidence.verifiedDistanceMeters>0&&!evidence.jumps&&evidence.validSamples>=2&&Number.isFinite(r.route?.distanceMeters)&&r.route.distanceMeters>0&&Number.isFinite(r.route?.durationSeconds)&&r.route.durationSeconds>0;
  const service=usable?evidence.verifiedDistanceMeters/Math.max(1,r.route.distanceMeters)*(r.fare.distanceFare||0)+evidence.verifiedSeconds/Math.max(1,r.route.durationSeconds)*(r.fare.timeFare||0):0;
  const proposedFare=evidence.policy.earlyChargePolicy==='verified_service_review'&&riderRequested?round(Math.max(0,Math.min(r.fare.total,service)),r.fare.currency):0;
  r.status='ended_early';r.endedAt=new Date();r.earlyEnd={...p,driverId:user.id,at:r.endedAt,lastFix,endLocation:validFix(lastFix,evidence.policy)?null:lastFix,evidence,proposedFare,currency:r.fare.currency,confirmationRequired:proposedFare>0,riderReply:null,reviewStatus:'pending',originalQuote:r.fare.total,policy:evidence.policy,decision:null};
  r.timeline.push({status:'ended_early',timestamp:r.endedAt,note:p.reason+' · '+p.requestedBy+(p.explanation?' · '+p.explanation:'')});
  r.markModified('earlyEnd');await r.save({session});
  await Driver.updateOne({_id:r.driverProfileId,currentRideId:r._id},{$set:{currentRideId:null}},{session});
  await TripEvent.create([{rideId:r._id,key:'early:'+r._id,event:'early_end_requested',actorId:user.id,details:'Early ending recorded; no automatic charge or cancellation penalty.'}],{session});
  return r;
 });await announce(ride,true);leaveRideRoom('/rider',String(ride.riderId),String(ride._id));leaveRideRoom('/driver',String(ride.driverId),String(ride._id));await redis.del('ride:members:'+ride._id).catch(()=>{});return ride;
}
export async function replyToEarlyEnd(id,user,body){
 const parsed=z.object({response:z.enum(['confirmed','disputed']),note:z.string().trim().max(1000).default('')}).strict().safeParse(body);if(!parsed.success)throw new EarlyEndError('Choose confirmation or dispute and a valid note',400);
 await connectDB();const ride=await mongoose.connection.transaction(async session=>{const r=await Ride.findOne({_id:id,riderId:user.id,status:'ended_early'}).session(session);if(!r)throw new EarlyEndError('Early-ended trip not found',404);
 if(r.earlyEnd.riderReply){if(r.earlyEnd.riderReply.response===parsed.data.response&&r.earlyEnd.riderReply.note===parsed.data.note)return r;throw new EarlyEndError('Your response is already recorded. Contact support for further review.');}
 r.earlyEnd.riderReply={...parsed.data,at:new Date(),actorId:user.id};r.markModified('earlyEnd');r.timeline.push({status:'early_end_'+parsed.data.response,timestamp:new Date(),note:parsed.data.note});await r.save({session});return r;});await announce(ride);return ride;
}
export async function reviewEarlyEnd(id,user,body){
 if(user.role!=='admin')throw new EarlyEndError('Administrator access required',403);
 const parsed=z.object({amount:z.number().finite().min(0),note:z.string().trim().min(10).max(1000),confirmed:z.literal(true)}).strict().safeParse(body);if(!parsed.success)throw new EarlyEndError('Provide a fare, review explanation and explicit confirmation',400);
 await connectDB();await WalletTransaction.init();
 const ride=await mongoose.connection.transaction(async session=>{
  const r=await Ride.findOne({_id:id,status:'ended_early'}).session(session);if(!r)throw new EarlyEndError('Early-ended trip not found',404);const p=parsed.data,c=r.fare.currency;
  if(r.earlyEnd.decision){if(r.earlyEnd.decision.amount===p.amount&&r.earlyEnd.decision.note===p.note)return r;throw new EarlyEndError('This review is settled. Historical settlement cannot be overwritten.');}
  if(round(p.amount,c)!==p.amount||p.amount>r.earlyEnd.proposedFare)throw new EarlyEndError('The charge cannot exceed verified, disclosed service or currency precision');
  if(p.amount>0&&(r.earlyEnd.riderReply?.response!=='confirmed'||r.earlyEnd.policy.earlyChargePolicy!=='verified_service_review'))throw new EarlyEndError('Positive charges require rider confirmation and the saved verified-service policy');
  const fraction=r.fare.total>0?r.fare.platformFee/r.fare.total:0,fee=round(p.amount*Math.max(0,Math.min(1,fraction)),c),earnings=round(p.amount-fee,c);
  for(const [userId,delta,type] of [[r.riderId,-p.amount,'ride_payment'],[r.driverId,earnings,'ride_earning']]){
   if(delta===0)continue;
   const account=await User.findById(userId).select('wallet egpWallet currencyWallets').session(session).lean();if(!account||walletAccount(account,c)?.currency!==c||walletAccount(account,c).balance+delta<0)throw new EarlyEndError('Wallet balance or currency requires review. Nothing was charged.');
   if(delta!==0){const updated=await User.findByIdAndUpdate(userId,walletDelta(delta,c),{session,returnDocument:'after',updatePipeline:true});await WalletTransaction.create([{userId,amount:delta,type,currency:c,rideId:r._id,balanceBefore:walletAccount(account,c).balance,balanceAfter:walletAccount(updated,c).balance,actorId:user.id,actorName:user.name,reason:p.note.slice(0,200),ref:`early:${r._id}:${type}`,note:'Reviewed early ending; no cancellation penalty'}],{session});}
  }
  r.earlyEnd.decision={amount:p.amount,platformFee:fee,driverEarnings:earnings,note:p.note,actorId:user.id,at:new Date()};r.earlyEnd.reviewStatus='resolved';r.payment.status=p.amount?'captured':'waived';r.markModified('earlyEnd');r.timeline.push({status:'early_end_reviewed',timestamp:new Date(),note:p.note});await r.save({session});
  await Payment.create([{rideId:r._id,riderId:r.riderId,driverId:r.driverId,amount:p.amount,currency:c,platformFee:fee,driverPayout:earnings,status:'succeeded',method:'wallet'}],{session});
  await AdminAudit.create([{actorId:user.id,targetId:r.riderId,action:'trip.early_end.reviewed',changes:{rideId:r._id,amount:p.amount,currency:c,reason:p.note}}],{session});return r;
 });await announce(ride);return ride;
}
