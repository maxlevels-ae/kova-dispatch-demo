import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {quoteDelivery} from '@/lib/delivery-service';
export async function POST(request){const {error}=await deliveryGuard(request,['rider']);if(error)return error;try{const {route,quote,vehicleTypes,pickupETA}=await quoteDelivery(await deliveryBody(request));return Response.json({route,quote,vehicleTypes,pickupETA});}catch(e){return deliveryFailure(e);}}
