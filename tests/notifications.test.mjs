import test from 'node:test';
import assert from 'node:assert/strict';
import {preferenceSchema,rideLink,safeNotificationLink} from '../src/lib/notification-policy.js';
import {validPushEndpoint,pushConfiguration} from '../src/lib/web-push.js';
import Ride from '../src/lib/db/models/Ride.js';
test('accepted vehicle snapshot preserves the vehicle category as a nested field',()=>{
 const ride=new Ride({assignedVehicle:{make:'Toyota',model:'Camry',plate:'QA-001',type:'economy'}});
 assert.equal(ride.assignedVehicle.make,'Toyota');assert.equal(ride.assignedVehicle.type,'economy');assert.equal(ride.$errors?.assignedVehicle,undefined);
});
test('notification deep links cannot leave the app or escalate to admin pages',()=>{
 const id='0123456789abcdef01234567';assert.equal(rideLink('rider',id),'/rides/'+id);assert.equal(rideLink('driver',id,true),'/driver/dashboard?ride='+id);assert.equal(rideLink('driver',id),'/driver/trips/'+id);
 for(const unsafe of ['https://evil.test','//evil.test','/admin/users','/rides/../../admin','javascript:alert(1)'])assert.equal(safeNotificationLink(unsafe),'/dashboard');
});
test('push endpoint validation blocks SSRF and only accepts supported HTTPS push services',()=>{
 for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x'])assert.equal(validPushEndpoint(url),false,url);
 for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'])assert.equal(validPushEndpoint('https://'+host+'/subscription'),true);
 assert.equal(pushConfiguration().enabled,false,'No production credentials in unit environment');
});
test('notification preferences reject unknown keys and non-boolean toggles',()=>{
 assert.equal(preferenceSchema.safeParse({muted:true,driverSound:false}).success,true);
 assert.equal(preferenceSchema.safeParse({userId:'someone-else',inApp:true}).success,false);
 assert.equal(preferenceSchema.safeParse({driverSound:'false'}).success,false);
});
