import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import {readSettingsJSON} from '@/lib/settings-http';
export async function deliveryGuard(request,roles){const auth=await requireAuth(roles);if(auth.error)return auth;if(!['GET','HEAD'].includes(request.method)&&!validSettingsOrigin(request))return {error:Response.json({error:'Invalid request origin'},{status:403})};return auth;}
export const deliveryBody=request=>readSettingsJSON(request,16000);
export function deliveryFailure(error){return Response.json({error:error.status?error.message:'Delivery operation unavailable. Please retry.'},{status:error.status||503});}
