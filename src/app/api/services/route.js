import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import {serviceAvailability} from '@/lib/service-availability';
export async function GET(request){const {error}=await deliveryGuard(request);if(error)return error;try{const {taxiEnabled,deliveryEnabled}=await serviceAvailability();return Response.json({taxiEnabled,deliveryEnabled},{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
