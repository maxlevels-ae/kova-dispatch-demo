import DeliveryCashEntry from '@/lib/db/models/DeliveryCashEntry';
import {bookingArea,courierReadiness,deliveryOperationsPolicy} from '@/lib/operating-areas';
import {currencyDigits} from '@/lib/countries';
import {mobileContact} from '@/lib/contact-phone';
import {translate} from '@/lib/i18n';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Delivery from '@/lib/db/models/Delivery';
import DeliveryEvidence from '@/lib/db/models/DeliveryEvidence';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import NotificationJob from '@/lib/db/models/NotificationJob';
import AdminAudit from '@/lib/db/models/AdminAudit';
import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';
import {walletAccount,walletDelta,minorUnits} from '@/lib/currency';
import {getRoute} from '@/lib/services/routing';
import {getDeliverySettings} from '@/lib/delivery-settings';
import {deliveryPoint,deliveryBookingSchema,selectedPackageBounds,deliveryPrice,deliveryTransitions,terminalDeliveryStates} from '@/lib/delivery-policy';
import {emitToUser,emitToAdmin} from '@/lib/realtime/emit';
import {deliverNotifications} from '@/lib/notifications';
export class DeliveryError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const fail=(message,status=409)=>{throw new DeliveryError(message,status);};
const equal=(a,b)=>String(a)===String(b);
const key=()=>crypto.createHash('sha256').update(process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET||fail('Verification configuration unavailable',503)).digest();
export function generateCode(minutes){
 const code=String(crypto.randomInt(100000,1000000)),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
 const encrypted=Buffer.concat([cipher.update(code,'utf8'),cipher.final()]);
 return {hash:crypto.createHmac('sha256',key()).update(code).digest('hex'),cipher:Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64'),expiresAt:new Date(Date.now()+minutes*60000),attempts:0};
}
export function decryptCode(value){const b=Buffer.from(value,'base64'),dec=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));dec.setAuthTag(b.subarray(12,28));return Buffer.concat([dec.update(b.subarray(28)),dec.final()]).toString();}
export function canAccessDelivery(order,user){return user.role==='admin'||equal(order.customerId,user.id)||equal(order.recipientId,user.id)||equal(order.courierId,user.id);}
export async function loadDelivery(id,user){
 await connectDB();if(!mongoose.isValidObjectId(id))fail('Invalid order reference',400);
 const order=await Delivery.findById(id);if(!order)fail('Delivery not found',404);if(!canAccessDelivery(order,user))fail('Forbidden',403);return order;
}
export async function deliveryView(order,user){
 const data=order.toObject?order.toObject():structuredClone(order);
 delete data.guestAccess;if(user.role==='admin'||equal(order.courierId,user.id)||equal(order.customerId,user.id))data.cashEntries=await DeliveryCashEntry.find({deliveryId:order._id}).sort({createdAt:1}).lean();
 data.recipientType=order.recipientType||(order.recipientId?'registered':'guest');data.verificationMethod=order.verificationMethod||(order.recipientId?'account_otp':'private_link');
 if(user.role==='admin')data.verificationAttempts={pickup:order.pickupCode?.attempts||0,delivery:order.deliveryCode?.attempts||0};
 data.country=data.operations?.country;data.zones=data.operations?{pickup:data.operations.pickupZone,dropoff:data.operations.dropoffZone}:undefined;delete data.operations;
 delete data.pickupCode;delete data.deliveryCode;delete data.policy;delete data.idempotencyKey;delete data.__v;
 const [courier,driver]=order.courierId?await Promise.all([User.findById(order.courierId).select('name avatar phone').lean(),Driver.findById(order.driverProfileId).select('location lastLocationUpdate stats.averageRating').lean()]):[null,null];
 data.courier=courier?{name:courier.name,avatar:courier.avatar,rating:driver?.stats?.averageRating,lastLocationAt:driver?.lastLocationUpdate||null,phone:!terminalDeliveryStates.includes(order.status)&&(user.role==='admin'||equal(order.customerId,user.id))?courier.phone:undefined,location:!terminalDeliveryStates.includes(order.status)&&driver?.lastLocationUpdate&&Date.now()-new Date(driver.lastLocationUpdate)<90000?{lng:driver.location.coordinates[0],lat:driver.location.coordinates[1]}:null}:null;
 if(user.role!=='admin')delete data.attempted;
 if(equal(order.recipientId,user.id)&&!equal(order.customerId,user.id)){delete data.sender;delete data.pickup;delete data.route;data.messages=[];}
 return data;
}
async function postLedger(userId,amount,type,order,ref,session){
 const currency=order.fare.currency;amount=minorUnits(amount,currency)/10**currencyDigits[currency];
 const before=await User.findById(userId).select('wallet egpWallet currencyWallets').session(session);
 if(!before||walletAccount(before,currency)?.currency!==currency||walletAccount(before,currency).balance+amount<0)fail('Insufficient '+currency+' balance');
 const updated=await User.findByIdAndUpdate(userId,walletDelta(amount,currency),{session,returnDocument:'after',updatePipeline:true});
 await WalletTransaction.create([{userId,type,amount,currency,balanceBefore:walletAccount(before,currency).balance,balanceAfter:walletAccount(updated,currency).balance,deliveryId:order._id,ref,note:'Maxride Delivery '+String(order._id)}],{session});
}
const eventTexts={"SEARCHING_COURIER":"Looking for a courier","COURIER_ASSIGNED":"Your courier has been assigned","COURIER_ARRIVING":"Your courier is on the way to pickup","AT_PICKUP":"Your courier has arrived at pickup","PICKED_UP":"Your package has been collected","IN_TRANSIT":"Your package is on the way","AT_DROPOFF":"Your courier has reached the recipient","DELIVERED":"Your package was delivered","CANCELLED":"Delivery cancelled","NO_COURIER":"No courier is available","DELIVERY_FAILED":"Delivery needs attention","RETURN_REQUESTED":"Package return requested","RETURNED":"Package returned to sender","offer":"New delivery request","message":"New delivery message"};
export async function deliveryNotify(order,event,eventId,exclude){
 const ids=event==='offer'?[order.offer?.courierId]:[order.customerId,order.courierId,...(event!=='message'&&order.policy.notifications.recipient?[order.recipientId]:[])];
 const users=await User.find({_id:{$in:ids.filter(Boolean)},isActive:true}).select('role language').lean();
 const setting={offer:'newDelivery',COURIER_ASSIGNED:'assigned',AT_PICKUP:'arrived',PICKED_UP:'collected',IN_TRANSIT:'inTransit',DELIVERED:'completed',DELIVERY_FAILED:'failed'}[event];
 for(const user of users){
  emitToUser('/'+user.role,String(user._id),'delivery:update',{id:String(order._id),status:order.status});
  if(equal(user._id,exclude)||(setting&&order.policy.notifications[setting]===false))continue;
  const href=user.role==='driver'?`/driver/deliveries/${order._id}`:`/deliveries/${order._id}`;
  const jobKey=`delivery:${order._id}:${eventId}:${user._id}`;
  await NotificationJob.updateOne({key:jobKey},{$setOnInsert:{key:jobKey,userId:user._id,role:user.role,event:event==='offer'?'delivery_offer':event==='message'?'delivery_message':'delivery_'+event,text:translate(eventTexts[event]||eventTexts.DELIVERY_FAILED,user.language),href,expiresAt:event==='offer'?order.offer.expiresAt:undefined}},{upsert:true});
  await deliverNotifications(user._id);
 }
 emitToAdmin('delivery:update',{id:String(order._id),status:order.status});
}
async function notifySafely(order,event,id,exclude){try{await deliveryNotify(order,event,id,exclude);}catch(error){console.error('Delivery notification pending',error.name);}}
export async function quoteDelivery(input,user){
 await connectDB();if(!user?.id)fail('Authentication required',401);
 const senderAccount=await User.findOne({_id:user.id,isActive:true,role:'rider'}).select('name phone phoneCountry').lean();
 if(!senderAccount?.name)fail('Complete your name and phone in your profile before sending a package.',400);
 const pickup=deliveryPoint.safeParse(input.pickup),dropoff=deliveryPoint.safeParse(input.dropoff);if(!pickup.success||!dropoff.success)fail('Choose valid pickup and dropoff locations.',400);const operations=await bookingArea('delivery',pickup.data,dropoff.data);const localCountry=operations.country.code;const accountContact=mobileContact(senderAccount.phone,senderAccount.phoneCountry||localCountry);if((accountContact.error||accountContact.phoneCountry!==localCountry)&&!input.alternatePickupContact)fail('A valid pickup contact is required.',400);
 const sender=input.alternatePickupContact?{...input.pickupContact,instructions:input.sender?.instructions||''}:{name:senderAccount.name,...accountContact,instructions:input.sender?.instructions||''};
 if(input.mode==='bring'&&!input.recipientOverride&&(accountContact.error||accountContact.phoneCountry!==localCountry))fail('Add a local recipient contact for this delivery.',400);
 const recipient=input.mode==='bring'&&!input.recipientOverride?{name:senderAccount.name,...accountContact,instructions:input.recipient?.instructions||''}:input.recipient;const parsed=deliveryBookingSchema.safeParse({...input,sender,recipient});if(!parsed.success)fail(parsed.error.issues[0]?.message||'Invalid delivery',400);
 const b=parsed.data,{settings:s}=await getDeliverySettings();if(!s.general.enabled)fail('Delivery service is currently disabled');
 for(const [field,label] of [['sender','Pickup contact'],['recipient','Recipient contact']]){const contact=mobileContact(b[field].phone,b[field].phoneCountry||localCountry);if(contact.error)fail(label+': '+contact.error,400);if(field==='sender'&&contact.phoneCountry!==localCountry)fail('Pickup contact must use a valid local mobile number',400);Object.assign(b[field],contact);}
 Object.assign(s,deliveryOperationsPolicy(s,operations));
 if(!s.payments[b.paymentMethod])fail('Payment method is unavailable',400);if(b.codAmount&&b.mode==='bring')fail('Merchandise COD is supported only for Send Package',400);if(b.codAmount&&(!s.payments.cod||b.paymentMethod!=='cash'||b.codAmount>s.payments.codMaximum))fail('Merchandise COD is unavailable or exceeds the configured limit',400);if(Math.abs(b.codAmount*10**currencyDigits[s.currency]-Math.round(b.codAmount*10**currencyDigits[s.currency]))>1e-6)fail('Invalid currency precision',400);
 const bounds=selectedPackageBounds(b.package.size,s.packages);for(const [key,value] of Object.entries(bounds))if(b.package[key]===undefined)b.package[key]=value;
 if(Object.entries(bounds).some(([key,max])=>b.package[key]>max))fail('Package exceeds the selected size limits. Choose a larger package size.',400);
 b.senderAccount={id:String(senderAccount._id),name:senderAccount.name,phone:accountContact.phone||senderAccount.phone,phoneCountry:accountContact.phoneCountry||senderAccount.phoneCountry,contactValid:!accountContact.error};
 if(!s.packages.categories.includes(b.package.category)||b.package.weight>s.packages.maxWeight||b.package.length>s.packages.maxLength||b.package.width>s.packages.maxWidth||b.package.height>s.packages.maxHeight)fail('Package exceeds configured category, weight or dimensions',400);
 const registeredRecipient=b.mode==='bring'&&!b.recipientOverride?senderAccount:b.recipient.username?await User.findOne({username:b.recipient.username.toLowerCase(),role:'rider',isActive:true}).select('_id phone phoneCountry').lean():null;
 if(b.recipient.username&&(!registeredRecipient||mobileContact(registeredRecipient.phone,registeredRecipient.phoneCountry).phone!==b.recipient.phone))fail('Registered recipient account and phone do not match.',400);
 const route=await getRoute(b.pickup,b.dropoff);
 if(b.vehicleType&&!s.eligibility.vehicles.includes(b.vehicleType))fail('This vehicle category is not enabled for Delivery',400);
 const nearby=s.eligibility.available?await Driver.aggregate([{$geoNear:{near:{type:'Point',coordinates:[b.pickup.lng,b.pickup.lat]},distanceField:'meters',maxDistance:s.dispatch.radiusKm*1000,spherical:true,query:{isOnline:true,isApproved:true,currentRideId:null,currentDeliveryId:null,'vehicle.type':{$in:s.eligibility.vehicles}}}}]):[];
 const accounts=await User.find({_id:{$in:nearby.map(d=>d.userId)}}).select('isActive wallet egpWallet currencyWallets').lean(),byId=new Map(accounts.map(u=>[String(u._id),u]));
 const eligible=nearby.filter(driver=>byId.get(String(driver.userId))?.isActive);
 const vehicles=await Promise.all(s.eligibility.vehicles.map(async type=>{const candidates=eligible.filter(d=>d.vehicle.type===type),driver=candidates[0],pickupRoute=driver?await getRoute({lat:driver.location.coordinates[1],lng:driver.location.coordinates[0]},b.pickup):null;return {type,quote:deliveryPrice(s,route,b.package.size,0,type),available:candidates.length>0,availableCount:candidates.length,pickupETA:pickupRoute?Math.max(1,Math.ceil(pickupRoute.durationSeconds/60)):null,pickupEstimateSource:pickupRoute?.source||null,deliveryMinutes:Math.ceil(route.durationSeconds/60),packageLimits:bounds};}));
 const selected=vehicles.find(v=>v.type===b.vehicleType)||vehicles[0];if(!selected)fail('No supported delivery vehicle category is configured');
 const selectedQuote=b.vehicleType?selected.quote:deliveryPrice(s,route,b.package.size);if(b.vehicleType){s.eligibility={...s.eligibility,vehicles:[b.vehicleType]};s.pricing={...s.pricing,vehicleSurcharge:selectedQuote.vehicle};}
 return {input:b,settings:s,operations,recipientId:registeredRecipient?._id,route,quote:selectedQuote,vehicles,vehicleTypes:vehicles.map(v=>v.type),pickupETA:selected.pickupETA};
}
export async function createDelivery(input,user){
 await Promise.all([Delivery.init(),WalletTransaction.init()]);
 await connectDB();if(typeof input.idempotencyKey!=='string'||!/^[-a-f\d]{36}$/i.test(input.idempotencyKey))fail('Invalid idempotency reference',400);const existing=await Delivery.findOne({idempotencyKey:input.idempotencyKey});if(existing){if(!equal(existing.customerId,user.id))fail('Idempotency key belongs to another customer');return existing;}
 const {input:b,settings:s,operations,recipientId,route,quote}=await quoteDelivery(input,user);
 const orderId=new mongoose.Types.ObjectId();
 const result=await mongoose.connection.transaction(async session=>{
  if(b.package.photoId){const photo=await DeliveryEvidence.findOne({_id:b.package.photoId,ownerId:user.id,kind:'package',deliveryId:null,expiresAt:{$gt:new Date()}}).session(session);if(!photo)fail('Invalid package photo',400);photo.deliveryId=orderId;photo.expiresAt=new Date(Date.now()+s.proof.retentionDays*86400000);await photo.save({session});}
  const [order]=await Delivery.create([{_id:orderId,customerId:user.id,mode:b.mode,payment:{method:b.paymentMethod,status:b.paymentMethod==='wallet'?'paid':'unpaid',payer:b.paymentMethod==='wallet'?'sender':s.payments.payer,cashStage:s.payments.cashStage,codAmount:b.codAmount,codPayee:user.id,codStatus:b.codAmount?'uncollected':'none'},recipientId,recipientType:recipientId?'registered':'guest',verificationMethod:recipientId?'account_otp':'private_link',idempotencyKey:b.idempotencyKey,pickup:b.pickup,dropoff:b.dropoff,sender:b.sender,senderAccount:b.senderAccount,alternatePickupContact:b.alternatePickupContact,recipient:b.recipient,package:b.package,region:b.region,route,quote,fare:quote,policy:s,operations,status:'SEARCHING_COURIER',manualHold:s.dispatch.mode==='manual',pickupCode:generateCode(s.proof.expiryMinutes),deliveryCode:generateCode(s.proof.expiryMinutes),timeline:[{status:'CREATED',event:'created',actorId:user.id,role:user.role,note:recipientId?'Registered recipient; account OTP':'Guest recipient; private link confirmation (phone ownership not verified)'},{status:'SEARCHING_COURIER',event:'dispatch_requested',actorId:user.id,role:user.role}]}],{session});
  if(b.paymentMethod==='wallet')await postLedger(user.id,-quote.total,'delivery_payment',order,`delivery:${orderId}:payment`,session);return order;
 });
 await notifySafely(result,result.status,'created');return result;
}
export async function verifyDeliveryCode(id,user,kind,code){
 const field=kind==='pickup'?'pickupCode':'deliveryCode';const order=await loadDelivery(id,user);
 if(!equal(order.courierId,user.id)||user.role!=='driver')fail('Only the assigned courier can verify a code',403);
 if(!/^[0-9]{6}$/.test(code||''))fail('Enter the six-digit confirmation code',400);
 const expected=kind==='pickup'?['AT_PICKUP','RETURN_REQUESTED']:['AT_DROPOFF'];if(!expected.includes(order.status))fail('Verification is not available at this stage');
 const guestGuard=kind==='delivery'&&!order.recipientId?{'guestAccess.expiresAt':{$gt:new Date()},'guestAccess.revokedAt':null}:{};
 const claimed=await Delivery.findOneAndUpdate({_id:id,status:order.status,...guestGuard,[field+'.attempts']:{$lt:order.policy.proof.maxAttempts},[field+'.expiresAt']:{$gt:new Date()},[field+'.verifiedAt']:null},{$inc:{[field+'.attempts']:1}},{returnDocument:'after'}).select('+'+field+'.hash');
 if(!claimed)fail('Code expired, already verified, or attempt limit reached');
 const actual=crypto.createHmac('sha256',key()).update(code).digest('hex');
 if(!crypto.timingSafeEqual(Buffer.from(claimed[field].hash),Buffer.from(actual))){await Delivery.updateOne({_id:id,status:order.status},{$push:{timeline:{status:order.status,event:kind+'_code_rejected',actorId:user.id,role:user.role,at:new Date()}}});fail('Incorrect confirmation code',400);}
 const verified=await Delivery.updateOne({_id:id,status:order.status,...guestGuard,[field+'.expiresAt']:{$gt:new Date()},[field+'.hash']:claimed[field].hash,[field+'.verifiedAt']:null},{$set:{[field+'.verifiedAt']:new Date()},$push:{timeline:{status:order.status,event:kind+'_code_verified',actorId:user.id,role:user.role,at:new Date()}}});
 if(!verified.modifiedCount)fail('Code changed; refresh and try again');
 return {verified:true};
}
export async function readDeliveryCode(id,user,kind){
 const order=await loadDelivery(id,user),field=kind==='pickup'?'pickupCode':'deliveryCode';
 if(!equal(kind==='pickup'?order.customerId:order.recipientId,user.id))fail('This code is private to the sender or recipient',403);
 if(terminalDeliveryStates.includes(order.status))fail('This delivery is closed');
 const secret=await Delivery.findById(id).select('+'+field+'.cipher');return {code:decryptCode(secret[field].cipher),expiresAt:secret[field].expiresAt,verifiedAt:secret[field].verifiedAt};
}
export async function renewDeliveryCode(id,user,kind){
 const order=await loadDelivery(id,user),field=kind==='pickup'?'pickupCode':'deliveryCode';
 if(!equal(kind==='pickup'?order.customerId:order.recipientId,user.id))fail('Forbidden',403);
 if(terminalDeliveryStates.includes(order.status))fail('This delivery is closed');
 const count=await redis.incr(`delivery:renew:${id}:${kind}`);if(count===1)await redis.expire(`delivery:renew:${id}:${kind}`,900);if(count>3)fail('Too many code requests. Try again later.',429);
 await Delivery.updateOne({_id:id,status:order.status},{$set:{[field]:generateCode(order.policy.proof.expiryMinutes)},$push:{timeline:{status:order.status,event:kind+'_code_renewed',actorId:user.id,role:user.role,at:new Date()}}});return {ok:true};
}
export async function transitionDelivery(id,user,to,note=''){
 const initial=await loadDelivery(id,user);if(initial.status===to&&terminalDeliveryStates.includes(to))return initial;
 if(!deliveryTransitions[initial.status]?.includes(to))fail('Invalid delivery status transition');
 const isCourier=user.role==='driver'&&equal(initial.courierId,user.id),isCustomer=equal(initial.customerId,user.id);
 if(to==='CANCELLED'){if(!isCustomer&&user.role!=='admin')fail('Only the customer or administrator may cancel',403);}
 else if(to==='RETURN_REQUESTED'){if(!isCustomer&&user.role!=='admin')fail('Return must be requested by the customer or administrator',403);}
 else if(!isCourier)fail('Only the assigned courier may record this event',403);
 if(['DELIVERY_FAILED','RETURN_REQUESTED','CANCELLED'].includes(to)&&note.trim().length<3)fail('A reason is required',400);
 const result=await mongoose.connection.transaction(async session=>{
  const order=await Delivery.findOne({_id:id,status:initial.status}).session(session);if(!order)fail('Delivery changed; refresh and try again');
  if(to==='PICKED_UP'&&order.policy.proof.pickupOTP&&!order.pickupCode.verifiedAt)fail('Verify the pickup code first');
  if(to==='DELIVERED'&&!order.recipientId&&(!order.guestAccess?.expiresAt||order.guestAccess.revokedAt||order.guestAccess.expiresAt<=new Date()))fail('Recipient link expired or revoked');
  if(to==='DELIVERED'&&!order.deliveryCode.verifiedAt)fail('Recipient verification is required');
  if(to==='RETURNED'&&!order.pickupCode.verifiedAt)fail('Verify the sender return code first');
  if(to==='DELIVERED'&&order.policy.proof.photoRequired&&!order.proof.photoId)fail('Proof photo is required');
  if(to==='AT_PICKUP')order.arrivedAt=new Date();
  if(to==='PICKED_UP'){order.pickedUpAt=new Date();const minutes=Math.max(0,(Date.now()-new Date(order.arrivedAt))/60000);order.fare=deliveryPrice(order.policy,order.route,order.package.size,Math.floor(minutes));const extra=order.fare.total-order.quote.total;if(extra>0&&order.payment?.method!=='cash')await postLedger(order.customerId,-extra,'delivery_payment',order,`delivery:${id}:waiting`,session);}
  if(to==='RETURN_REQUESTED')order.pickupCode=generateCode(order.policy.proof.expiryMinutes);
  if(to==='DELIVERED'){
   if(order.payment?.method!=='cash')await postLedger(order.courierId,order.fare.earnings,'delivery_earning',order,`delivery:${id}:earning`,session);
   if(order.payment?.method==='cash'&&(order.payment.status!=='collected'||order.payment.feeCollected!==order.fare.total||(order.payment.codAmount>0&&order.payment.codStatus!=='collected')))fail('Confirm actual cash collection before delivery');order.settlement={status:order.payment?.method==='cash'?(order.fare.commission+(order.payment.codAmount||0)>0?'cash_reconciliation_pending':'cash_reconciled'):'settled',at:new Date()};order.deliveredAt=new Date();order.proof.confirmedAt=new Date();order.proof.recipientConfirmed=true;order.proof.recipientId=order.recipientId;
  }
  if(['CANCELLED','RETURNED'].includes(to)&&order.payment?.method==='cash'){order.settlement={status:order.payment.status==='collected'||order.payment.codStatus==='collected'?'cash_refund_review':'cancelled_unpaid',at:new Date()};}
  if(['CANCELLED','RETURNED'].includes(to)&&order.payment?.method!=='cash'){
   const fee=to==='CANCELLED'&&order.courierId?Math.min(order.fare.total,order.policy.pricing.cancellation):0;
   const refund=order.fare.total-fee;if(refund>0)await postLedger(order.customerId,refund,'refund',order,`delivery:${id}:refund`,session);
   if(fee>0)await postLedger(order.courierId,fee,'delivery_earning',order,`delivery:${id}:cancellation`,session);
   order.settlement={status:fee?'cancellation_settled':'refunded',at:new Date()};order.cancelledAt=to==='CANCELLED'?new Date():undefined;
  }
  order.status=to;order.offer=undefined;order.timeline.push({status:to,event:'transition',actorId:user.id,role:user.role,note:note.slice(0,500)});
  await order.save({session});if(terminalDeliveryStates.includes(to))await Driver.updateOne({_id:order.driverProfileId,currentDeliveryId:id},{$set:{currentDeliveryId:null}},{session});return order;
 });
 await notifySafely(result,to,result.timeline.at(-1)._id);return result;
}
export async function acceptDelivery(id,user){
 await connectDB();const result=await mongoose.connection.transaction(async session=>{
  const order=await Delivery.findOne({_id:id,status:'SEARCHING_COURIER','offer.courierId':user.id,'offer.expiresAt':{$gt:new Date()}}).session(session);if(!order)fail('Delivery offer expired or is unavailable');
  const driver=await Driver.findOneAndUpdate({userId:user.id,isOnline:true,isApproved:true,currentRideId:null,currentDeliveryId:null,'vehicle.type':{$in:order.policy.eligibility.vehicles}},{$set:{currentDeliveryId:id}},{session,returnDocument:'after'});
  if(!driver)fail('Courier is unavailable or already assigned');
  order.status='COURIER_ASSIGNED';order.courierId=user.id;order.driverProfileId=driver._id;order.vehicle=driver.vehicle.toObject();order.offer=undefined;order.timeline.push({status:order.status,event:'courier_accepted',actorId:user.id,role:user.role});await order.save({session});return order;
 });await notifySafely(result,result.status,result.timeline.at(-1)._id);return result;
}
export async function declineDelivery(id,user){
 const order=await Delivery.findOneAndUpdate({_id:id,status:'SEARCHING_COURIER','offer.courierId':user.id},{$unset:{offer:1},$push:{timeline:{status:'SEARCHING_COURIER',event:'offer_declined',actorId:user.id,role:user.role,at:new Date()}}},{returnDocument:'after'});if(!order)fail('Offer is unavailable');return order;
}
export async function deliveryMessage(id,user,text,clientId){
 const order=await loadDelivery(id,user);if(user.role==='admin'||(!equal(order.customerId,user.id)&&!equal(order.courierId,user.id)))fail('Only customer and courier may chat',403);
 if(terminalDeliveryStates.includes(order.status))fail('Delivery chat is closed');
 const prior=order.messages.find(m=>m.clientId===clientId);if(prior){if(!equal(prior.senderId,user.id))fail('Message reference already used');return prior;}
 const message={clientId,senderId:user.id,role:user.role,text,at:new Date()};
 const updated=await Delivery.findOneAndUpdate({_id:id,status:order.status,'messages.clientId':{$ne:clientId},'messages.499':{$exists:false}},{$push:{messages:message}},{returnDocument:'after'});if(!updated)fail('Message limit reached or delivery changed');
 await notifySafely(updated,'message',clientId,user.id);return updated.messages.at(-1);
}
export async function assignDelivery(id,admin,courierId){
 const order=await loadDelivery(id,admin);if(admin.role!=='admin')fail('Forbidden',403);
 if(!['SEARCHING_COURIER','COURIER_ASSIGNED','COURIER_ARRIVING'].includes(order.status))fail('Reassignment is unsafe after arrival or pickup');
 if(!order.policy.eligibility.available)fail('Delivery courier availability is disabled');
 const driver=await Driver.findOne({userId:courierId,isOnline:true,isApproved:true,currentRideId:null,currentDeliveryId:null,'services.deliveries':true,'vehicle.type':{$in:order.policy.eligibility.vehicles},lastLocationUpdate:{$gt:new Date(Date.now()-90000)},...(order.policy.eligibility.requireLicense?{'license.verified':true}:{})});if(!driver)fail('Courier is not eligible or available');
 const account=await User.findById(courierId).select('isActive wallet egpWallet currencyWallets').lean();
 const check=courierReadiness(driver,account,{snapshot:order.operations,policy:order.policy,pickup:order.pickup,currency:order.quote.currency});if(!check.eligible)fail(check.reasons.map(r=>r.message).join('; '));
 const updated=await mongoose.connection.transaction(async session=>{
  const current=await Delivery.findOne({_id:id,status:order.status}).session(session);if(!current)fail('Delivery changed');
  if(current.driverProfileId)await Driver.updateOne({_id:current.driverProfileId,currentDeliveryId:id},{$set:{currentDeliveryId:null}},{session});
  current.courierId=undefined;current.driverProfileId=undefined;current.vehicle=undefined;current.status='SEARCHING_COURIER';current.manualHold=true;current.offer={id:crypto.randomUUID(),courierId,profileId:driver._id,expiresAt:new Date(Date.now()+current.policy.dispatch.acceptanceSeconds*1000)};current.timeline.push({status:current.status,event:'admin_offer_sent',actorId:admin.id,role:'admin',note:'Courier '+courierId});await current.save({session});return current;
 });
 await AdminAudit.create({actorId:admin.id,targetId:order.customerId,action:'delivery.assignment',changes:{deliveryId:id,courierId}});if(order.courierId)emitToUser('/driver',String(order.courierId),'delivery:update',{id,status:'SEARCHING_COURIER'});await notifySafely(updated,'offer',updated.offer.id);return updated;
}
