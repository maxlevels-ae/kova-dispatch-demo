import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {quoteDelivery} from '@/lib/delivery-service';
export async function POST(request){const {error,session}=await deliveryGuard(request,['rider']);if(error)return error;try{const {route,quote,vehicles,vehicleTypes,pickupETA}=await quoteDelivery(await deliveryBody(request),session.user);return Response.json({route,quote,vehicles,vehicleTypes,pickupETA},{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
