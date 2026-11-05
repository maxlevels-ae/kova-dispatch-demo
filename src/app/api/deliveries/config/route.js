import {activeOperations,deliveryOperationsPolicy} from '@/lib/operating-areas';
import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import {getDeliverySettings} from '@/lib/delivery-settings';
export async function GET(request){const {error}=await deliveryGuard(request);if(error)return error;try{const {settings,revision}=await getDeliverySettings();const operations=await activeOperations();Object.assign(settings,deliveryOperationsPolicy(settings,operations));return Response.json({revision:operations.revision+':'+revision,settings,country:operations.country,center:operations.config.center,recipientChannel:'private_link',smsEnabled:false},{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
