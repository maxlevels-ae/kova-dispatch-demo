import sharp from 'sharp';
import mongoose from 'mongoose';
import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import {readSettingsJSON} from '@/lib/settings-http';
import Driver from '@/lib/db/models/Driver';
import VehiclePhoto from '@/lib/db/models/VehiclePhoto';
import AdminAudit from '@/lib/db/models/AdminAudit';
export async function POST(request,{params}){
 const {session,error}=await requireAuth(['driver','admin']);if(error)return error;
 if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
 const {id}=await params;if(!mongoose.isValidObjectId(id))return Response.json({error:'Invalid driver'},{status:400});
 if(session.user.role!=='admin'&&session.user.id!==id)return Response.json({error:'Forbidden'},{status:403});
 try{
  const {image}=await readSettingsJSON(request,2900000);
  const match=typeof image==='string'&&/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if(!match)throw Error('Use a PNG, JPEG or WebP image');
  const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>2*1024*1024)throw Error('Vehicle image must be at most 2 MB');
  const decoded=sharp(bytes,{limitInputPixels:16000000,failOn:'warning'});const meta=await decoded.metadata();if(meta.format!==match[1]||(meta.pages||1)!==1)throw Error('Image content does not match a supported static image type');
  const clean=await decoded.rotate().resize({width:1000,height:750,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
  const driver=await Driver.findOne({userId:id});if(!driver)return Response.json({error:'Driver not found'},{status:404});
  const photo=await VehiclePhoto.create({driverUserId:id,uploadedBy:session.user.id,bytes:clean});
  const imageUrl='/api/vehicle-photos/'+photo._id;
  await Driver.updateOne({_id:driver._id},{$set:{'vehicle.imageUrl':imageUrl}});
  if(session.user.role==='admin')await AdminAudit.create({actorId:session.user.id,targetId:id,action:'driver.vehicle_photo.updated',changes:{photoId:photo._id}});
  return Response.json({imageUrl});
 }catch(e){return Response.json({error:e.message||'Unable to upload vehicle image'},{status:e.status||400});}
}
