import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryBookingSchema,deliveryDefaults,deliverySettingsSchema,deliveryPrice,deliveryTransitions,terminalDeliveryStates} from '../src/lib/delivery-policy.js';
import {translate} from '../src/lib/i18n.js';
import {safeNotificationLink} from '../src/lib/notification-policy.js';
test('delivery policies require recipient verification, valid regions and a single shared assignment',()=>{
 assert.equal(deliverySettingsSchema.safeParse(deliveryDefaults).success,true);
 for(const patch of [{proof:{...deliveryDefaults.proof,deliveryOTP:false}},{dispatch:{...deliveryDefaults.dispatch,capacity:2}},{general:{...deliveryDefaults.general,regions:['Atlantis']}}])assert.equal(deliverySettingsSchema.safeParse({...deliveryDefaults,...patch}).success,false);
});
test('delivery pricing uses its own EGP rates, minimum, package fee and bounded free waiting',()=>{
 const quote=deliveryPrice(deliveryDefaults,{distanceMeters:2000},'medium',10);
 assert.equal(quote.total,47);assert.equal(quote.waiting,5);assert.equal(quote.commission,4.7);assert.equal(quote.earnings,42.3);assert.equal(quote.currency,'EGP');
 assert.equal(deliveryPrice(deliveryDefaults,{distanceMeters:10},'small').total,35);
});
test('delivery lifecycle forbids skipping handover and completion is terminal',()=>{
 assert.ok(!deliveryTransitions.COURIER_ASSIGNED.includes('DELIVERED'));
 assert.ok(!deliveryTransitions.PICKED_UP.includes('CANCELLED'));
 for(const state of terminalDeliveryStates)assert.deepEqual(deliveryTransitions[state],[]);
 assert.deepEqual(deliveryTransitions.DELIVERY_FAILED,['RETURN_REQUESTED']);
});
test('Arabic customer labels and interpolations preserve mixed text isolation',()=>{
 assert.equal(translate('Send a Package','ar'),'أرسل طرداً');assert.equal(translate('Wallet','en'),'Wallet');
 assert.equal(translate('Estimated arrival: 5 min','ar'),'الوصول المتوقع: \u20685\u2069 دقيقة');
 assert.equal(safeNotificationLink('/deliveries/0123456789abcdef01234567'),'/deliveries/0123456789abcdef01234567');
 assert.equal(safeNotificationLink('/deliveries/../../admin'),'/dashboard');
});

test('guest booking requires contacts and valid coordinates; country containment is enforced by booking policy',()=>{
 const input={pickup:{lat:30.0444,lng:31.2357,address:'Cairo pickup'},dropoff:{lat:30.05,lng:31.24,address:'Cairo destination'},sender:{name:'Sender',phone:'+201000000001'},recipient:{name:'Guest',phone:'+201000000002'},region:'Cairo',package:{category:'Documents',size:'small',weight:1,length:10,width:10,height:10,description:'Sealed documents'},acknowledged:true,idempotencyKey:'c68639a8-8ad7-4b3a-a6e9-d616b1ba3504'};
 assert.equal(deliveryBookingSchema.safeParse(input).success,true);
 assert.equal(deliveryBookingSchema.safeParse({...input,recipient:{...input.recipient,username:'registered'}}).success,true);
 assert.equal(deliveryBookingSchema.safeParse({...input,recipient:{name:'Guest'}}).success,false);
 assert.equal(deliveryBookingSchema.safeParse({...input,dropoff:{...input.dropoff,lat:91}}).success,false);
});
import {mobileContact} from '../src/lib/contact-phone.js';
test('contact phones are independent of operating country and require explicit context for national numbers',()=>{
 for(const [phone,phoneCountry] of [['+971501234567','AE'],['+962791234567','JO'],['+966501234567','SA'],['+201012345678','EG']])assert.deepEqual(mobileContact(phone),{phone,phoneCountry});
 assert.equal(mobileContact('0501234567').error,'Country code required');
 assert.deepEqual(mobileContact('0501234567','AE'),{phone:'+971501234567',phoneCountry:'AE'});
 assert.equal(mobileContact('123','AE').error,'Phone number invalid');
 assert.equal(mobileContact('+971 50 123 4567').phone,'+971501234567');
 assert.equal(mobileContact('+971501234567 ext 12').error,'Phone number invalid');
 assert.equal(mobileContact('+20223456789').error,'Phone number invalid');
});


test('cash methods require an explicit consistent country policy and never accept card simulation',async()=>{
 const {deliveryPaymentSchema,deliveryPaymentDefaults,deliveryBookingSchema}=await import('../src/lib/delivery-policy.js');
 assert.equal(deliveryPaymentDefaults.cash,false);assert.equal(deliveryPaymentDefaults.cod,false);
 assert.equal(deliveryPaymentSchema.safeParse({...deliveryPaymentDefaults,cash:true,payer:'recipient',cashStage:'pickup'}).success,false);
 assert.equal(deliveryPaymentSchema.safeParse({...deliveryPaymentDefaults,cod:true,codMaximum:10}).success,false);
 assert.equal(deliveryPaymentSchema.safeParse({...deliveryPaymentDefaults,cash:true,cod:true,codMaximum:10}).success,true);
 assert.equal(deliveryBookingSchema.shape.paymentMethod.safeParse('card').success,false);
});
test('active-country local phone normalization does not mutate account identity',async()=>{
 const {mobileContact}=await import('../src/lib/contact-phone.js');assert.equal(mobileContact('0793088001','JO').phone,'+962793088001');assert.ok(mobileContact('0793088001','EG').error);assert.equal(mobileContact('+971501234567','JO').phoneCountry,'AE');
});
