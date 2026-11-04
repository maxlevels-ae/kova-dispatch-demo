import sharp from 'sharp';
import {readSettingsJSON} from '@/lib/settings-http';
import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import {loadDelivery,DeliveryError} from '@/lib/delivery-service';
import {getDeliverySettings} from '@/lib/delivery-settings';
import DeliveryEvidence from '@/lib/db/models/DeliveryEvidence';
import Delivery from '@/lib/db/models/Delivery';
export async function POST(request){const {session,error}=await deliveryGuard(request,['rider','driver']);if(error)return error;try{
 const b=await readSettingsJSON(request,2900000),kind=b.kind,user=session.user;let order;
 if(!['package','proof'].includes(kind))throw new DeliveryError('Invalid evidence type',400);
 if(kind==='package'&&user.role!=='rider')throw new DeliveryError('Forbidden',403);
 if(kind==='proof'){order=await loadDelivery(b.deliveryId,user);if(user.role!=='driver'||String(order.courierId)!==user.id||order.status!=='AT_DROPOFF')throw new DeliveryError('Only the assigned courier at dropoff may upload proof',403);}
 const match=typeof b.image==='string'&&b.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw new DeliveryError('Choose a PNG, JPEG or WebP image',400);
 const input=Buffer.from(match[2],'base64');if(input.length>2097152)throw new DeliveryError('Image must be at most 2 MB',400);
 let bytes;try{const decoder=sharp(input,{limitInputPixels:16000000,animated:false});const meta=await decoder.metadata();if(!['png','jpeg','webp'].includes(meta.format)||meta.format!==match[1])throw Error();bytes=await decoder.rotate().resize({width:1400,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();}catch{throw new DeliveryError('Invalid or oversized image',400);}
 const settings=order?.policy||(await getDeliverySettings()).settings;
 const evidence=await DeliveryEvidence.create({ownerId:user.id,deliveryId:order?._id,kind,bytes,contentType:'image/webp',expiresAt:new Date(Date.now()+(order?settings.proof.retentionDays:1)*86400000)});
 if(order){const updated=await Delivery.updateOne({_id:order._id,status:'AT_DROPOFF',courierId:user.id},{$set:{'proof.photoId':evidence._id},$push:{timeline:{status:order.status,event:'proof_uploaded',actorId:user.id,role:user.role,at:new Date()}}});if(!updated.modifiedCount)throw new DeliveryError('Delivery changed; photo was not attached');}
 return Response.json({id:String(evidence._id),url:'/api/deliveries/evidence/'+evidence._id},{status:201});
 }catch(e){return deliveryFailure(e);}}
