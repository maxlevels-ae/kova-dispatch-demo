import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
export async function GET(request){const {error}=await deliveryGuard(request,['admin']);if(error)return error;try{const drivers=await Driver.find({isOnline:true,isApproved:true,currentRideId:null,currentDeliveryId:null,'services.deliveries':true}).select('userId vehicle').limit(100).lean();const users=await User.find({_id:{$in:drivers.map(d=>d.userId)},isActive:true}).select('name').lean();return Response.json({couriers:drivers.filter(d=>users.some(u=>String(u._id)===String(d.userId))).map(d=>({...d,name:users.find(u=>String(u._id)===String(d.userId)).name}))});}catch(e){return deliveryFailure(e);}}
