import { z } from 'zod';
export const preferenceDefaults = {inApp:true,driverSound:true,riderSound:true,messages:true,rideEvents:true,browser:true,push:true,muted:false};
export const preferenceSchema = z.object(Object.fromEntries(Object.keys(preferenceDefaults).map(key=>[key,z.boolean().optional()]))).strict();
export function rideLink(role,id,offer=false) {
  if(!/^[a-f\d]{24}$/i.test(String(id))) return role==='driver'?'/driver/dashboard':'/dashboard';
  return role==='driver'?(offer?`/driver/dashboard?ride=${id}`:`/driver/trips/${id}`):`/rides/${id}`;
}
export function safeNotificationLink(value) {
  return /^\/(?:rides|deliveries|driver\/deliveries|driver\/trips)\/[a-f\d]{24}$/i.test(value)||/^\/driver\/dashboard(?:\?ride=[a-f\d]{24})?$/i.test(value)?value:'/dashboard';
}
