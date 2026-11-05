import {z} from 'zod';
export const rideSafetySchema=z.object({
 pickupRadiusMeters:z.number().min(25).max(300).default(100),destinationRadiusMeters:z.number().min(25).max(300).default(120),
 maxAgeSeconds:z.number().min(10).max(60).default(30),maxAccuracyMeters:z.number().min(5).max(100).default(50),
 maxSpeedKph:z.number().min(60).max(200).default(180),maxGapSeconds:z.number().min(15).max(90).default(45),
 minProgressMeters:z.number().min(20).max(500).default(100),shortTripMeters:z.number().min(50).max(500).default(300),
 earlyChargePolicy:z.enum(['no_charge','verified_service_review']).default('no_charge'),
}).strict();
export const rideSafetyDefaults=rideSafetySchema.parse({});
export const earlyReasons=['rider_requested','destination_changed','breakdown','driver_unable','safety_emergency','wrong_destination','other'];
export function meters(a,b){const rad=n=>n*Math.PI/180,dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);const q=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));}
export function validFix(fix,policy,now=Date.now()){
 if(!fix||!Number.isFinite(fix.lat)||!Number.isFinite(fix.lng)||Math.abs(fix.lat)>90||Math.abs(fix.lng)>180)return 'GPS is unavailable. Enable location or use the early-end safety review.';
 const age=now-new Date(fix.at).getTime();if(!Number.isFinite(age)||age<0||age>policy.maxAgeSeconds*1000)return 'GPS is stale. Wait for a fresh location or use the early-end safety review.';
 if(!Number.isFinite(fix.accuracy)||fix.accuracy<=0||fix.accuracy>policy.maxAccuracyMeters)return 'GPS accuracy is insufficient. Move to an open area or use the early-end safety review.';
 return null;
}
export function evaluateProgress(samples,start,pickup,dropoff,policy,now=Date.now()){
 const last=samples.at(-1),straight=meters(pickup,dropoff);let distance=0,seconds=0,jumps=0,gaps=0,validCount=0,previous=null,first=null;
 for(const fix of samples){if(new Date(fix.at)<new Date(start)||!Number.isFinite(fix.accuracy)||fix.accuracy<=0||fix.accuracy>policy.maxAccuracyMeters)continue;validCount++;first ||= fix;
  if(previous){const dt=(new Date(fix.at)-new Date(previous.at))/1000,d=meters(previous,fix);if(dt<=0||d>policy.maxSpeedKph/3.6*dt+Math.min(50,previous.accuracy+fix.accuracy)){jumps++;previous=fix;continue;}if(dt>policy.maxGapSeconds){gaps++;previous=fix;continue;}distance+=Math.max(0,d-(previous.accuracy+fix.accuracy));seconds+=dt;}previous=fix;
 }
 // A continuous, plausible track also proves net displacement. This avoids
 // erasing genuine slow movement by subtracting GPS uncertainty at every ping.
 if(first&&previous&&!jumps&&!gaps)distance=Math.max(distance,Math.max(0,meters(first,previous)-first.accuracy-previous.accuracy));
 const distanceToDestination=last?meters(last,dropoff):null,requiredProgress=Math.min(policy.minProgressMeters,Math.max(3,straight*.5));
 let error=validFix(last,policy,now);
 if(!error&&straight<policy.shortTripMeters&&last.accuracy>Math.max(5,straight/4))error='GPS accuracy is insufficient for this short trip. Use the early-end review if you cannot continue.';
 if(!error&&jumps)error='GPS movement is implausible. Use the early-end review if you cannot continue.';
 if(!error&&distanceToDestination>Math.min(policy.destinationRadiusMeters,Math.max(15,straight*.2))+Math.min(last.accuracy,25))error='You have not reached the destination yet.';
 if(!error&&(distance<requiredProgress||validCount<(straight<policy.shortTripMeters?2:3)||seconds<Math.min(30,straight/10)))error='Meaningful trip progress has not been verified. Continue the trip or request an early-end review.';
 return {valid:!error,error,distanceToDestination:distanceToDestination==null?null:Math.round(distanceToDestination),verifiedDistanceMeters:Math.round(distance),verifiedSeconds:Math.round(seconds),validSamples:validCount,jumps,gaps,lastFix:last||null,requiredProgressMeters:requiredProgress};
}
