import {currencyDigits} from './countries';
import {z} from 'zod';
import {egyptLocations} from './map-config';
export const deliveryCities=Object.assign({},...Object.values(egyptLocations));
export const terminalDeliveryStates=['DELIVERED','CANCELLED','NO_COURIER','RETURNED'];
export const deliveryTransitions={
 CREATED:['SEARCHING_COURIER','CANCELLED'],SEARCHING_COURIER:['COURIER_ASSIGNED','NO_COURIER','CANCELLED'],
 COURIER_ASSIGNED:['COURIER_ARRIVING','CANCELLED'],COURIER_ARRIVING:['AT_PICKUP','CANCELLED'],
 AT_PICKUP:['PICKED_UP','CANCELLED'],PICKED_UP:['IN_TRANSIT','DELIVERY_FAILED'],
 IN_TRANSIT:['AT_DROPOFF','DELIVERY_FAILED'],AT_DROPOFF:['DELIVERED','DELIVERY_FAILED'],
 DELIVERY_FAILED:['RETURN_REQUESTED'],RETURN_REQUESTED:['RETURNED'],DELIVERED:[],CANCELLED:[],NO_COURIER:[],RETURNED:[],
};
const money=z.number().finite().min(0).max(10000),names=z.array(z.string().trim().min(1).max(60)).min(1).max(30);
export const deliverySettingsSchema=z.object({
 general:z.object({enabled:z.boolean(),name:z.string().trim().min(1).max(60),startHour:z.number().int().min(0).max(23),endHour:z.number().int().min(1).max(24),regions:names.refine(values=>values.every(v=>Object.hasOwn(deliveryCities,v)),'Choose supported Egyptian cities')}),
 packages:z.object({categories:names,maxWeight:z.number().positive().max(100),maxLength:z.number().positive().max(200),maxWidth:z.number().positive().max(200),maxHeight:z.number().positive().max(200),prohibited:names,handling:z.string().max(1000)}),
 pricing:z.object({base:money,perKm:money,minimum:money,vehicleSurcharge:money,small:money,medium:money,large:money,waitingPerMinute:money,waitingFreeMinutes:z.number().int().min(0).max(60),cancellation:money,commission:z.number().min(0).max(50)}),
 dispatch:z.object({mode:z.enum(['automatic','manual']),radiusKm:z.number().positive().max(50),acceptanceSeconds:z.number().int().min(5).max(25),maxAttempts:z.number().int().min(1).max(20),capacity:z.literal(1)}),
 eligibility:z.object({driverTypes:z.array(z.literal('approved_driver')).length(1),vehicles:z.array(z.enum(['economy','comfort','premium','xl'])).min(1),requireLicense:z.boolean(),available:z.boolean()}),
 notifications:z.object({newDelivery:z.boolean(),assigned:z.boolean(),arrived:z.boolean(),collected:z.boolean(),inTransit:z.boolean(),completed:z.boolean(),failed:z.boolean(),recipient:z.boolean()}),
 proof:z.object({pickupOTP:z.boolean(),deliveryOTP:z.literal(true),photoRequired:z.boolean(),expiryMinutes:z.number().int().min(5).max(1440),maxAttempts:z.number().int().min(3).max(10),retentionDays:z.number().int().min(7).max(365)}),
}).strict();
export const deliveryDefaults={
 general:{enabled:false,name:'Maxride Delivery',startHour:0,endHour:24,regions:['Cairo']},
 packages:{categories:['Documents','Clothing','Electronics','Other'],maxWeight:10,maxLength:60,maxWidth:40,maxHeight:40,prohibited:['Weapons','Illegal substances','Cash','Hazardous materials','Live animals'],handling:'Keep sealed; do not accept prohibited items.'},
 pricing:{base:20,perKm:6,minimum:35,vehicleSurcharge:0,small:0,medium:10,large:20,waitingPerMinute:1,waitingFreeMinutes:5,cancellation:10,commission:10},
 dispatch:{mode:'automatic',radiusKm:15,acceptanceSeconds:16,maxAttempts:8,capacity:1},eligibility:{driverTypes:['approved_driver'],vehicles:['economy','comfort','xl'],requireLicense:true,available:true},
 notifications:{newDelivery:true,assigned:true,arrived:true,collected:true,inTransit:true,completed:true,failed:true,recipient:true},
 proof:{pickupOTP:true,deliveryOTP:true,photoRequired:false,expiryMinutes:120,maxAttempts:5,retentionDays:90},
};
export const deliveryPoint=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),address:z.string().trim().min(3).max(300)});
const contact=z.object({name:z.string().trim().min(2).max(100),phone:z.string().trim().min(1).max(40),phoneCountry:z.string().regex(/^[A-Z]{2}$/).optional().or(z.literal('')),instructions:z.string().max(500).default('')});
export const deliveryPaymentDefaults={wallet:true,cash:false,payer:'sender',cashStage:'pickup',cod:false,codMaximum:0};
export const deliveryPaymentSchema=z.object({wallet:z.boolean(),cash:z.boolean(),payer:z.enum(['sender','recipient']),cashStage:z.enum(['pickup','dropoff']),cod:z.boolean(),codMaximum:z.number().finite().min(0).max(100000)}).strict().refine(p=>p.wallet||p.cash,'Enable at least one payment method').refine(p=>!p.cod||(p.cash&&p.codMaximum>0),'COD requires cash and a positive limit').refine(p=>!p.cash||(p.payer==='sender'?p.cashStage==='pickup':p.cashStage==='dropoff'),'Cash collection stage must match the payer');
export const deliveryBookingSchema=z.object({
 mode:z.enum(['send','bring']).default('send'),recipientOverride:z.boolean().default(false),paymentMethod:z.enum(['wallet','cash']).default('wallet'),codAmount:z.number().finite().min(0).max(100000).default(0),alternatePickupContact:z.boolean().default(false),pickupContact:contact.optional(),pickup:deliveryPoint,dropoff:deliveryPoint,sender:contact,recipient:contact.extend({username:z.string().trim().min(3).max(30).optional()}),region:z.string().max(60),
 package:z.object({category:z.string().max(60),size:z.enum(['small','medium','large']),weight:z.number().positive().optional(),length:z.number().positive().optional(),width:z.number().positive().optional(),height:z.number().positive().optional(),description:z.string().trim().min(3).max(500),handling:z.string().max(500).default(''),photoId:z.string().regex(/^[a-f\d]{24}$/i).optional()}),
 acknowledged:z.literal(true),idempotencyKey:z.uuid(),
}).strict();
export function deliveryPrice(settings,route,size,waitingMinutes=0){
 const currency=settings.currency||'EGP',factor=10**currencyDigits[currency],round=n=>Math.round(n*factor)/factor;
 const p=settings.pricing;const distance=round(route.distanceMeters/1000*p.perKm);
 const waiting=round(Math.max(0,waitingMinutes-p.waitingFreeMinutes)*p.waitingPerMinute);
 const total=round(Math.max(p.minimum,p.base+distance+p.vehicleSurcharge+p[size])+waiting);
 const commission=round(total*p.commission/100);
 return {currency,base:p.base,distance,vehicle:p.vehicleSurcharge,size:p[size],waiting,total,commission,earnings:round(total-commission)};
}

export const packageBounds={small:{weight:2,length:30,width:20,height:15},medium:{weight:5,length:40,width:30,height:30},large:{weight:10,length:60,width:40,height:40}};
export function selectedPackageBounds(size,settings){const preset=packageBounds[size];if(!preset)return null;return Object.fromEntries(Object.entries(preset).map(([key,value])=>[key,Math.min(value,settings['max'+key[0].toUpperCase()+key.slice(1)])]));}
