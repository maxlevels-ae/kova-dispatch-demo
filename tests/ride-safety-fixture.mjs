// Disposable database evidence fixtures; never usable against production.
import mongoose from 'mongoose';
import Ride from '../src/lib/db/models/Ride.js';
import Driver from '../src/lib/db/models/Driver.js';
import Sample from '../src/lib/db/models/RideGpsSample.js';
import {rideSafetyDefaults,meters} from '../src/lib/ride-safety-policy.js';
function guard(){if(!mongoose.connection.name?.startsWith('maxride_qa_')||!process.env.MONGODB_URI?.startsWith('mongodb://127.0.0.1:27028/'))throw Error('GPS fixtures require the disposable local QA database');}
export async function pickupFixture(id){guard();const r=await Ride.findById(id);await Sample.deleteMany({rideId:id});await Driver.updateOne({_id:r.driverProfileId},{$set:{location:r.pickup.location,locationAccuracy:5,lastLocationUpdate:new Date()}});}
export async function journeyFixture(id){guard();const r=await Ride.findById(id),p={lng:r.pickup.location.coordinates[0],lat:r.pickup.location.coordinates[1]},d={lng:r.dropoff.location.coordinates[0],lat:r.dropoff.location.coordinates[1]};
 const seconds=Math.max(60,Math.ceil(meters(p,d)/8)),count=Math.ceil(seconds/10),now=Date.now(),start=now-seconds*1000;
 const samples=Array.from({length:count+1},(_,i)=>({rideId:r._id,driverId:r.driverId,lat:p.lat+(d.lat-p.lat)*i/count,lng:p.lng+(d.lng-p.lng)*i/count,accuracy:5,at:new Date(start+seconds*1000*i/count),expiresAt:new Date(now+86400000)}));
 await Sample.deleteMany({rideId:id});await Sample.insertMany(samples);await Ride.updateOne({_id:id},{$set:{startedAt:new Date(start),'safety.start':samples[0],'safety.policy':r.safety?.policy||rideSafetyDefaults}});
}
