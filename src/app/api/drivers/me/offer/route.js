import {requireAuth} from '@/lib/auth/helpers';
import Ride from '@/lib/db/models/Ride';
export async function GET(){
 const {session,error}=await requireAuth(['driver']);if(error)return error;
 const ride=await Ride.findOne({status:'searching','dispatch.currentOffer.userId':session.user.id,'dispatch.currentOffer.expiresAt':{$gt:new Date()}}).select('dispatch.currentOffer').lean();
 return Response.json({offer:ride?.dispatch?.currentOffer?.payload||null},{headers:{'Cache-Control':'no-store'}});
}
