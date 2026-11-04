import mongoose from 'mongoose';
import {z} from 'zod';
import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {serviceAvailability} from '@/lib/service-availability';
import {DeliveryError} from '@/lib/delivery-service';
import {deliveryDefaults} from '@/lib/delivery-policy';
import PlatformSettings from '@/lib/db/models/PlatformSettings';
const schema=z.object({taxiEnabled:z.boolean(),deliveryEnabled:z.boolean(),revisions:z.object({services:z.number().int().min(0),delivery:z.number().int().min(0)}).strict()}).strict();
export async function GET(request){const {error}=await deliveryGuard(request,['admin']);if(error)return error;try{return Response.json(await serviceAvailability(),{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
export async function PUT(request){const {session,error}=await deliveryGuard(request,['admin']);if(error)return error;try{const parsed=schema.safeParse(await deliveryBody(request));if(!parsed.success)return Response.json({error:'Choose valid service switches and revisions'},{status:400});const b=parsed.data;await mongoose.connection.transaction(async transaction=>{
 for(const id of ['services','delivery']){const current=await PlatformSettings.findById(id).session(transaction);if((current?.revision||0)!==b.revisions[id])throw new DeliveryError('Settings changed; reload before saving');const value=id==='services'?{...(current?.value||{}),taxiEnabled:b.taxiEnabled}:{...structuredClone(current?.value||deliveryDefaults),general:{...(current?.value?.general||deliveryDefaults.general),enabled:b.deliveryEnabled}};const changed=await PlatformSettings.findOneAndUpdate({_id:id,revision:b.revisions[id]},{$set:{value},$inc:{revision:1},$push:{history:{$each:[{actor:session.user.id,at:new Date(),fields:[id==='services'?'taxiEnabled':'general.enabled'],value}],$slice:-100}}},{session:transaction,upsert:!current,returnDocument:'after'});if(!changed)throw new DeliveryError('Settings changed; reload before saving');}
 });return Response.json({...await serviceAvailability(),message:'Settings saved successfully'});}catch(e){if(e.code===11000)return Response.json({error:'Settings changed; reload before saving'},{status:409});return deliveryFailure(e);}}
