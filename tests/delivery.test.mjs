import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryDefaults,deliverySettingsSchema,deliveryPrice,deliveryTransitions,terminalDeliveryStates} from '../src/lib/delivery-policy.js';
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
