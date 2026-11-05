import mongoose from 'mongoose';
import Delivery from '@/lib/db/models/Delivery';
import DeliveryCashEntry from '@/lib/db/models/DeliveryCashEntry';
import {loadDelivery,DeliveryError} from '@/lib/delivery-service';
import {currencyDigits} from '@/lib/countries';
const fail=message=>{throw new DeliveryError(message,409);};
export async function recordDeliveryCash(id,user,input){
 const initial=await loadDelivery(id,user);
 if(initial.payment?.method!=='cash')fail('This order does not use cash');
 const collect=input.kind==='fee_collection'||input.kind==='cod_collection';
 if(collect?(user.role!=='driver'||String(initial.courierId)!==user.id):user.role!=='admin')throw new DeliveryError('Forbidden',403);
 await DeliveryCashEntry.init();
 return mongoose.connection.transaction(async session=>{
  const prior=await DeliveryCashEntry.findOne({reference:input.idempotencyKey}).session(session);
  if(prior){if(String(prior.deliveryId)!==id||String(prior.actorId)!==user.id||prior.kind!==input.kind||prior.amount!==input.amount||prior.currency!==input.currency)fail('Idempotency reference conflicts with another operation');return Delivery.findById(id).session(session);}
  const order=await Delivery.findById(id).session(session),p={...order.payment};
  if(collect&&String(order.courierId)!==user.id)fail('Courier assignment changed');
  let expected=0,payer,payee;
  if(input.kind==='fee_collection'){
   if(order.status==='AT_DROPOFF'&&p.cashStage==='pickup'&&!(p.feeCollected>0))fail('The sender must pay at pickup');
   if(!(p.cashStage==='pickup'?['AT_PICKUP','PICKED_UP','AT_DROPOFF']:['AT_DROPOFF']).includes(order.status))fail('Cash collection is not available at this stage');
   expected=order.fare.total-(p.feeCollected||0);payer=p.payer;payee='courier';p.feeCollected=order.fare.total;p.status='collected';
  }else if(input.kind==='cod_collection'){
   if(order.status!=='AT_DROPOFF'||!order.deliveryCode.verifiedAt||p.codStatus!=='uncollected')fail('Verify recipient handover before merchandise collection');
   expected=p.codAmount;payer='recipient';payee=String(order.customerId);p.codStatus='collected';
  }else if(input.kind==='remittance'){
   if(order.status!=='DELIVERED'||p.remittedAt)fail('Remittance requires an unreconciled delivered order');
   expected=order.fare.commission+(p.codAmount||0);payer=String(order.courierId);payee='platform';p.remittedAt=new Date();order.settlement={status:p.codAmount?'cod_payout_pending':'cash_reconciled',at:new Date()};
  }else if(input.kind==='cod_payout'){
   if(order.status!=='DELIVERED'||!p.remittedAt||p.codStatus!=='collected')fail('Remit collected merchandise funds first');
   expected=p.codAmount;payer='platform';payee=String(order.customerId);p.codStatus='paid_to_sender';order.settlement={status:'cash_reconciled',at:new Date()};
  }else if(['fee_refund','cod_refund'].includes(input.kind)){
   if(!['CANCELLED','RETURNED'].includes(order.status)||(input.kind==='fee_refund'?p.refundedAt:p.codRefundedAt))fail('Refund requires a cancelled or returned order');
   expected=input.kind==='fee_refund'?(p.feeCollected||0):(p.codStatus==='collected'?p.codAmount:0);payer=String(order.courierId);payee=input.kind==='fee_refund'?p.payer:'recipient';if(input.kind==='fee_refund'){p.refundedAt=new Date();p.status='refunded';}else{p.codRefundedAt=new Date();p.codStatus='refunded';}order.settlement={status:(!(p.feeCollected>0)||p.refundedAt)&&(!(p.codAmount>0)||p.codStatus!=='collected')?'cash_refunded':'cash_refund_review',at:new Date()};
  }
  const factor=10**currencyDigits[order.fare.currency];expected=Math.round(expected*factor)/factor;
  if(expected<=0||input.currency!==order.fare.currency||input.amount!==expected||Math.abs(input.amount*factor-Math.round(input.amount*factor))>1e-6)fail('Amount or currency does not match the outstanding cash obligation');
  await DeliveryCashEntry.create([{deliveryId:id,actorId:user.id,courierId:order.courierId,reference:input.idempotencyKey,receipt:input.receipt,kind:input.kind,currency:order.fare.currency,amount:expected,payer,payee}],{session});
  order.payment=p;order.timeline.push({status:order.status,event:'cash_'+input.kind,actorId:user.id,role:user.role,note:input.receipt});await order.save({session});return order;
 }).catch(async error=>{if(error.code===11000){const prior=await DeliveryCashEntry.findOne({reference:input.idempotencyKey});if(prior&&String(prior.deliveryId)===id&&String(prior.actorId)===user.id&&prior.kind===input.kind&&prior.amount===input.amount&&prior.currency===input.currency)return loadDelivery(id,user);}throw error;});
}
