import Delivery from '@/lib/db/models/Delivery';
import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {createDelivery,deliveryView} from '@/lib/delivery-service';
import {dispatchDeliveries} from '@/lib/delivery-dispatch';
import {deliveryTransitions} from '@/lib/delivery-policy';
export async function GET(request){const {session,error}=await deliveryGuard(request);if(error)return error;try{
 const user=session.user,url=new URL(request.url),page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1)),status=url.searchParams.get('status'),q=(url.searchParams.get('q')||'').slice(0,100);
 const filter=user.role==='admin'?{}:user.role==='driver'?{courierId:user.id}:{$or:[{customerId:user.id},{recipientId:user.id}]};
 const overviewFilter={...filter};
 if(status&&Object.hasOwn(deliveryTransitions,status))filter.status=status;
 if(user.role==='admin'&&url.searchParams.get('userId')?.match(/^[a-f\d]{24}$/i))filter.$or=[{customerId:url.searchParams.get('userId')},{courierId:url.searchParams.get('userId')},{recipientId:url.searchParams.get('userId')}];
 if(q)filter['package.description']={$regex:q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'};
 const [rows,total]=await Promise.all([Delivery.find(filter).select('status customerId courierId recipientId pickup dropoff package.size package.description fare createdAt deliveredAt').sort({createdAt:-1}).skip((page-1)*20).limit(20).lean(),Delivery.countDocuments(filter)]);
 const counts=user.role==='admin'?await Delivery.aggregate([{$match:overviewFilter},{$group:{_id:'$status',count:{$sum:1}}}]):[];
 return Response.json({counts,orders:rows.map(o=>({...o,pickup:user.role==='rider'&&String(o.recipientId)===user.id&&String(o.customerId)!==user.id?undefined:o.pickup})),total,page},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return deliveryFailure(e);}}
export async function POST(request){const {session,error}=await deliveryGuard(request,['rider']);if(error)return error;let body;try{body=await deliveryBody(request);const order=await createDelivery(body,session.user);dispatchDeliveries().catch(()=>{});return Response.json({order:await deliveryView(order,session.user)},{status:201});}catch(e){if(e.code===11000&&body?.idempotencyKey){const order=await Delivery.findOne({idempotencyKey:body.idempotencyKey,customerId:session.user.id});if(order)return Response.json({order:await deliveryView(order,session.user)});}return deliveryFailure(e);}}
