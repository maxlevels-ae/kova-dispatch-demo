import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import Delivery from '@/lib/db/models/Delivery';
import {activeOperations,courierReadiness,deliveryOperationsPolicy} from '@/lib/operating-areas';
import {getDeliverySettings} from '@/lib/delivery-settings';
export async function GET(request){const {error}=await deliveryGuard(request,['admin']);if(error)return error;try{
 const current=await activeOperations(),id=new URL(request.url).searchParams.get('order');
 if(id&&!/^[a-f\d]{24}$/i.test(id))return Response.json({error:'Invalid order reference'},{status:400});
 const order=id?await Delivery.findById(id).lean():null;
 if(id&&!order)return Response.json({error:'Delivery not found'},{status:404});
 const snapshot=order?.operations||current,policy=order?.policy||deliveryOperationsPolicy((await getDeliverySettings()).settings,snapshot);
 const drivers=await Driver.find({isOnline:true,isApproved:true,currentRideId:null,currentDeliveryId:null,'services.deliveries':true}).lean();
 const users=await User.find({_id:{$in:drivers.map(d=>d.userId)},isActive:true}).select('name isActive wallet egpWallet currencyWallets').lean();
 return Response.json({couriers:drivers.filter(d=>courierReadiness(d,users.find(u=>String(u._id)===String(d.userId)),{snapshot,policy,pickup:order?.pickup||snapshot.config.center,currency:order?.fare.currency}).eligible).slice(0,100).map(d=>({_id:d._id,userId:d.userId,vehicle:d.vehicle,name:users.find(u=>String(u._id)===String(d.userId)).name}))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return deliveryFailure(e);}}
