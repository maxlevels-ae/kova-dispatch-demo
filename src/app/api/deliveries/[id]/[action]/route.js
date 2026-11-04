import {manageGuestLink} from '@/lib/delivery-guest';
import {z} from 'zod';
import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {loadDelivery,deliveryView,transitionDelivery,acceptDelivery,declineDelivery,deliveryMessage,readDeliveryCode,verifyDeliveryCode,renewDeliveryCode,assignDelivery,DeliveryError} from '@/lib/delivery-service';
export async function GET(request,{params}){const {session,error}=await deliveryGuard(request);if(error)return error;try{const {id,action}=await params;if(!['pickup-code','delivery-code'].includes(action))throw new DeliveryError('Not found',404);return Response.json(await readDeliveryCode(id,session.user,action==='pickup-code'?'pickup':'delivery'),{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
export async function POST(request,{params}){const {session,error}=await deliveryGuard(request);if(error)return error;try{
 const {id,action}=await params,b=await deliveryBody(request),user=session.user;let order;
 if(action==='guest-link'){const p=z.object({revoke:z.boolean().default(false)}).strict().parse(b);return Response.json(await manageGuestLink(id,user,p.revoke),{headers:{'Cache-Control':'no-store'}});}
 else if(action==='accept'){if(user.role!=='driver')throw new DeliveryError('Forbidden',403);order=await acceptDelivery(id,user);}
 else if(action==='decline'){if(user.role!=='driver')throw new DeliveryError('Forbidden',403);order=await declineDelivery(id,user);return Response.json({ok:Boolean(order)});}
 else if(action==='status'){const p=z.object({status:z.string(),note:z.string().max(500).default('')}).strict().parse(b);order=await transitionDelivery(id,user,p.status,p.note);}
 else if(action==='messages'){const p=z.object({text:z.string().trim().min(1).max(500),clientId:z.uuid()}).strict().parse(b);return Response.json({message:await deliveryMessage(id,user,p.text,p.clientId)});}
 else if(action==='verify'){const p=z.object({kind:z.enum(['pickup','delivery']),code:z.string().regex(/^\d{6}$/)}).strict().parse(b);return Response.json(await verifyDeliveryCode(id,user,p.kind,p.code));}
 else if(action==='renew-code'){const p=z.object({kind:z.enum(['pickup','delivery'])}).strict().parse(b);return Response.json(await renewDeliveryCode(id,user,p.kind));}
 else if(action==='assign'){if(user.role!=='admin')throw new DeliveryError('Forbidden',403);const p=z.object({courierId:z.string().regex(/^[a-f\d]{24}$/i)}).strict().parse(b);order=await assignDelivery(id,user,p.courierId);}
 else throw new DeliveryError('Not found',404);
 return Response.json({order:await deliveryView(order||await loadDelivery(id,user),user)});
 }catch(e){if(e instanceof z.ZodError)return Response.json({error:e.issues[0].message},{status:400});return deliveryFailure(e);}}
