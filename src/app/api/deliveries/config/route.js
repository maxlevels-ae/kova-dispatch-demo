import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import {getDeliverySettings} from '@/lib/delivery-settings';
export async function GET(request){const {error}=await deliveryGuard(request);if(error)return error;try{const {settings}=await getDeliverySettings();return Response.json({settings,recipientChannel:'maxride_account',smsEnabled:false},{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
