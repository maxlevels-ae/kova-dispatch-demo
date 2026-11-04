import mongoose from 'mongoose';
import {requireAuth} from '@/lib/auth/helpers';
import Ride from '@/lib/db/models/Ride';
import TripEvent from '@/lib/db/models/TripEvent';
import NotificationJob from '@/lib/db/models/NotificationJob';
import redis from '@/lib/db/redis';
import {getRoute} from '@/lib/services/routing';
import {deliverNotifications} from '@/lib/notifications';
export async function GET(_request,{params}){
 const {session,error}=await requireAuth(['rider']);if(error)return error;const {id}=await params;
 if(!mongoose.isValidObjectId(id))return Response.json({error:'Invalid ride'},{status:400});
 const ride=await Ride.findOne({_id:id,riderId:session.user.id,status:'accepted'}).lean();if(!ride)return Response.json({minutes:null});
 try{
  const key=`ride:eta:${id}:${ride.driverProfileId}`;const cached=await redis.get(key);if(cached)return Response.json(JSON.parse(cached));
  const loc=await redis.hgetall(`driver:loc:${ride.driverProfileId}`);
  if(!loc.ts||Date.now()-Number(loc.ts)>90000||!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lng)))return Response.json({minutes:null,reason:'Waiting for fresh driver GPS'});
  const route=await getRoute({lat:Number(loc.lat),lng:Number(loc.lng)},{lat:ride.pickup.location.coordinates[1],lng:ride.pickup.location.coordinates[0]});
  const result={minutes:Math.max(1,Math.ceil(route.durationSeconds/60)),source:route.source,updatedAt:new Date(Number(loc.ts)).toISOString()};
  await redis.set(key,JSON.stringify(result),'EX',20);
  if(route.source==='osrm'&&result.minutes<=3){
   const eventKey=`${id}:${ride.driverId}:approaching`;
   await TripEvent.updateOne({key:eventKey},{$setOnInsert:{key:eventKey,rideId:id,event:'driver_approaching',actorId:ride.driverId,details:`Routing ETA ${result.minutes} min from fresh GPS`}},{upsert:true});
   const notificationKey=`${session.user.id}:${eventKey}`;
   await NotificationJob.updateOne({key:notificationKey},{$setOnInsert:{key:notificationKey,userId:session.user.id,rideId:id,role:'rider',event:'driver_approaching',text:`Your driver is approaching (about ${result.minutes} min)`,href:`/rides/${id}`}},{upsert:true});
   await deliverNotifications(session.user.id);
  }
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({minutes:null,reason:'Arrival estimate temporarily unavailable'});}
}
