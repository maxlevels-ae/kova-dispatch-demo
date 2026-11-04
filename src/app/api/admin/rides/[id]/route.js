import mongoose from 'mongoose';
import {requireAuth} from '@/lib/auth/helpers';
import Ride from '@/lib/db/models/Ride';
import User from '@/lib/db/models/User';
import Driver from '@/lib/db/models/Driver';
import Payment from '@/lib/db/models/Payment';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import TripEvent from '@/lib/db/models/TripEvent';
import AdminAudit from '@/lib/db/models/AdminAudit';
export async function GET(_request,{params}){
 const {session,error}=await requireAuth(['admin']);if(error)return error;
 const {id}=await params;if(!mongoose.isValidObjectId(id))return Response.json({error:'Invalid ride reference'},{status:400});
 const ride=await Ride.findById(id).select('-pin -__v -dispatch.currentOffer.payload').lean();if(!ride)return Response.json({error:'Ride not found'},{status:404});
 const [rider,driver,profile,events,payments,ledger]=await Promise.all([
  User.findById(ride.riderId).select('name username avatar rating role').lean(),
  ride.driverId?User.findById(ride.driverId).select('name username avatar rating role').lean():null,
  ride.driverProfileId?Driver.findById(ride.driverProfileId).select('vehicle stats.averageRating').lean():null,
  TripEvent.find({rideId:id}).sort({at:1}).limit(200).select('-__v -key').lean(),
  Payment.find({rideId:id}).select('amount currency platformFee driverPayout status method createdAt').lean(),
  WalletTransaction.find({rideId:id}).select('userId type amount currency note createdAt').limit(100).lean(),
 ]);
 await AdminAudit.create({actorId:session.user.id,targetId:ride.riderId,action:'trip.investigation.viewed',changes:{rideId:id,scope:'participants, route, timeline, messages, settlement'}});
 const vehicle=ride.assignedVehicle?.plate?ride.assignedVehicle:profile?.vehicle;
 const senders=await User.find({_id:{$in:[...new Set((ride.messages||[]).map(m=>m.senderId).filter(Boolean).map(String))]}}).select('name').lean();
 for(const message of ride.messages||[])message.senderName=senders.find(u=>String(u._id)===String(message.senderId))?.name||`${message.from} (identity was not recorded)`;
 return Response.json({ride,rider,driver:driver?{...driver,rating:profile?.stats?.averageRating,vehicle}:null,vehicleSource:ride.assignedVehicle?.plate?'Recorded at acceptance':'Current driver profile; historical vehicle was not recorded',events,payments,ledger,limitations:['Continuous GPS history was not recorded. Timeline locations are discrete recorded events, not a travelled route.','Message delivery/read receipts were not recorded.','Operational offer events are retained for 90 days; older events may be unavailable.']},{headers:{'Cache-Control':'no-store'}});
}
