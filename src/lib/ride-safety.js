import RideGpsSample from '@/lib/db/models/RideGpsSample';
import Driver from '@/lib/db/models/Driver';
import TripEvent from '@/lib/db/models/TripEvent';
import {getSettings} from '@/lib/settings';
import {rideSafetySchema,meters,validFix,evaluateProgress} from './ride-safety-policy';
export class RideSafetyError extends Error{constructor(message,evidence){super(message);this.status=409;this.evidence=evidence;this.code='TRIP_LOCATION_REVIEW';}}
export async function safetyPolicy(ride){return rideSafetySchema.parse(ride.safety?.policy||(await getSettings()).dispatch.safety);}
export async function latestFix(ride,session){
 const sample=await RideGpsSample.findOne({rideId:ride._id,driverId:ride.driverId}).sort({at:-1}).session(session||null).lean();
 if(sample)return {lat:sample.lat,lng:sample.lng,at:sample.at,accuracy:sample.accuracy};
 const driver=await Driver.findById(ride.driverProfileId).select('location locationAccuracy lastLocationUpdate').session(session||null).lean();
 return driver?.lastLocationUpdate&&driver?.location?.coordinates?.length===2?{lng:driver.location.coordinates[0],lat:driver.location.coordinates[1],accuracy:driver.locationAccuracy,at:driver.lastLocationUpdate}:null;
}
export async function pickupEvidence(ride,session){const policy=await safetyPolicy(ride),fix=await latestFix(ride,session),point={lng:ride.pickup.location.coordinates[0],lat:ride.pickup.location.coordinates[1]},distance=fix?Math.round(meters(fix,point)):null;const error=validFix(fix,policy)||(distance>policy.pickupRadiusMeters+Math.min(fix.accuracy,25)?'You have not reached the pickup yet.':null);return {valid:!error,error,distanceToPickup:distance,lastFix:fix,policy};}
export async function tripEvidence(ride,session){
 const policy=await safetyPolicy(ride),samples=await RideGpsSample.find({rideId:ride._id,driverId:ride.driverId,at:{$gte:ride.startedAt||new Date()}}).sort({at:1}).limit(10001).session(session||null).lean();
 const start=ride.safety?.start; // Pre-start fixes are evidence, never billable movement.
 const point=p=>({lng:p.location.coordinates[0],lat:p.location.coordinates[1]});
 const result=evaluateProgress(samples,ride.startedAt,point(ride.pickup),point(ride.dropoff),policy);
 if(!samples.length)result.error='Trip progress has not been recorded. Wait for fresh GPS or use the early-end review.';
 if(!start||samples.length>10000){result.valid=false;result.error='Trip GPS evidence is incomplete. Use the early-end review.';}
 result.verifiedSeconds=Math.min(result.verifiedSeconds,Math.max(0,Math.floor((Date.now()-new Date(ride.startedAt))/1000)));
 if(result.valid&&result.verifiedSeconds<Math.min(30,meters(point(ride.pickup),point(ride.dropoff))/10)){result.valid=false;result.error='Meaningful trip progress has not been verified. Continue the trip or request an early-end review.';}
 return {...result,policy,startFix:start||null};
}
export async function rejectUnsafe(ride,evidence,event){
 // Durable, bounded operational evidence; no wallet or trip status mutation.
 await TripEvent.updateOne({key:`safety:${ride._id}:${event}:${Math.floor(Date.now()/60000)}`},{$setOnInsert:{rideId:ride._id,event,actorId:ride.driverId,at:new Date(),expiresAt:new Date(Date.now()+90*86400000),details:JSON.stringify({message:evidence.error,distanceToPickup:evidence.distanceToPickup,distanceToDestination:evidence.distanceToDestination,lastFix:evidence.lastFix,verifiedDistanceMeters:evidence.verifiedDistanceMeters,jumps:evidence.jumps})}},{upsert:true});
 throw new RideSafetyError(evidence.error,evidence);
}
