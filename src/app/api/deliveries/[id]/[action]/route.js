import {getRoute} from '@/lib/services/routing';
import {recordDeliveryCash} from '@/lib/delivery-cash';
import {manageGuestLink} from '@/lib/delivery-guest';
import {z} from 'zod';
import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {loadDelivery,deliveryView,transitionDelivery,acceptDelivery,declineDelivery,deliveryMessage,readDeliveryCode,verifyDeliveryCode,renewDeliveryCode,assignDelivery,DeliveryError} from '@/lib/delivery-service';
export async function GET(request,{params}){const {session,error}=await deliveryGuard(request);if(error)return error;try{const {id,action}=await params;if(action==='tracking'){const order=await loadDelivery(id,session.user);if(session.user.role!=='admin'&&String(order.customerId)!==session.user.id&&String(order.courierId)!==session.user.id)throw new DeliveryError('Forbidden',403);const view=await deliveryView(order,session.user),position=view.courier?.location;const target=['PICKED_UP','IN_TRANSIT','AT_DROPOFF'].includes(order.status)?order.dropoff:order.pickup;const route=position?await getRoute(position,target):null;return Response.json({location:position||null,lastLocationAt:view.courier?.lastLocationAt||null,route,target:target===order.dropoff?'dropoff':'pickup'},{headers:{'Cache-Control':'no-store'}});}if(!['pickup-code','delivery-code'].includes(action))throw new DeliveryError('Not found',404);return Response.json(await readDeliveryCode(id,session.user,action==='pickup-code'?'pickup':'delivery'),{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
export async function POST(request,{params}){const {session,error}=await deliveryGuard(request);if(error)return error;try{
 const {id,action}=await params,b=await deliveryBody(request),user=session.user;let order;
 if(action==='cash'){const p=z.object({kind:z.enum(['fee_collection','cod_collection','remittance','fee_refund','cod_refund','cod_payout']),amount:z.number().finite().positive(),currency:z.string().length(3),receipt:z.string().trim().min(3).max(200),idempotencyKey:z.uuid(),confirmed:z.literal(true)}).strict().parse(b);order=await recordDeliveryCash(id,user,p);}
 else if(action==='guest-link'){const p=z.object({revoke:z.boolean().default(false)}).strict().parse(b);return Response.json(await manageGuestLink(id,user,p.revoke),{headers:{'Cache-Control':'no-store'}});}
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
