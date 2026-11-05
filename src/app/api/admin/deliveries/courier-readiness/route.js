import mongoose from 'mongoose';
import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import {activeOperations,courierReadiness,deliveryOperationsPolicy} from '@/lib/operating-areas';
import {getDeliverySettings} from '@/lib/delivery-settings';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import Delivery from '@/lib/db/models/Delivery';
import AdminAudit from '@/lib/db/models/AdminAudit';
export async function GET(request){
 const {error,session}=await deliveryGuard(request,['admin']);if(error)return error;
 try{
  const query=new URL(request.url).searchParams,id=query.get('order');
  if(id&&!mongoose.isValidObjectId(id))return Response.json({error:'Invalid order reference'},{status:400});
  const current=await activeOperations(),order=id?await Delivery.findById(id).lean():null;
  if(id&&!order)return Response.json({error:'Delivery not found'},{status:404});
  const snapshot=order?.operations||current,policy=order?.policy||deliveryOperationsPolicy((await getDeliverySettings()).settings,snapshot),pickup=order?.pickup||snapshot.config.center;
  const candidates=await Driver.find().sort({_id:1}).lean(),users=await User.find({_id:{$in:candidates.map(d=>d.userId)}}).select('name username isActive wallet egpWallet currencyWallets').lean(),byId=new Map(users.map(u=>[String(u._id),u]));
  const counts={},rows=candidates.map(d=>{const u=byId.get(String(d.userId)),check=courierReadiness(d,u,{snapshot,policy,pickup,currency:order?.quote.currency});for(const reason of check.reasons)counts[reason.code]=(counts[reason.code]||0)+1;return {id:String(d._id),userId:String(d.userId),name:u?.name||'Missing account',username:u?.username,accountActive:!!u?.isActive,approved:d.isApproved,online:d.isOnline,services:d.services,selectedCountry:d.operatingCountry||'Not recorded',vehicle:d.vehicle,license:{verified:d.license?.verified,expiry:d.license?.expiry},documents:d.documents?.map(v=>({type:v.type,verified:v.verified})),assignment:{ride:d.currentRideId,delivery:d.currentDeliveryId},...check};});
  await AdminAudit.create({actorId:session.user.id,targetId:order?.customerId||session.user.id,action:'delivery.readiness.view',changes:{deliveryId:id||undefined,candidateCount:rows.length}});
  return Response.json({checkedAt:new Date(),country:snapshot.country,pickup,policyAvailable:policy.eligibility.available,order:order?{id:String(order._id),status:order.status,createdAt:order.createdAt,attempts:order.attempts,timeline:order.timeline,settlement:order.settlement}:null,historicalCaveat:order?'Eligibility reflects current accounts and GPS, not reconstructed historical conditions.':null,counts,total:rows.length,eligible:rows.filter(r=>r.eligible).length,rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return deliveryFailure(e);}
}
