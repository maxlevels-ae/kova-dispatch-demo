import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import {loadDelivery,deliveryView} from '@/lib/delivery-service';
import AdminAudit from '@/lib/db/models/AdminAudit';
export async function GET(request,{params}){const {session,error}=await deliveryGuard(request);if(error)return error;try{const {id}=await params,order=await loadDelivery(id,session.user);if(session.user.role==='admin')await AdminAudit.create({actorId:session.user.id,targetId:order.customerId,action:'delivery.investigation.viewed',changes:{deliveryId:id}});return Response.json({order:await deliveryView(order,session.user)},{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
