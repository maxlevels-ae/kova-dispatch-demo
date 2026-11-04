import crypto from 'node:crypto';
import {z} from 'zod';
import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import PushSubscription from '@/lib/db/models/PushSubscription';
import {pushConfiguration,validPushEndpoint} from '@/lib/web-push';
import {readSettingsJSON} from '@/lib/settings-http';
const schema=z.object({endpoint:z.string().max(2048).refine(validPushEndpoint),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}={0,2}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/)}).strict()}).strict();
export async function GET(){const {session,error}=await requireAuth();if(error)return error;return Response.json({...pushConfiguration(),subscriptions:await PushSubscription.countDocuments({userId:session.user.id,expiresAt:{$gt:new Date()}})},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request){
 const {session,error}=await requireAuth();if(error)return error;
 if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
 if(!pushConfiguration().enabled)return Response.json({error:'Background push is disabled: VAPID is not configured'},{status:503});
 let data;try{data=schema.parse(await readSettingsJSON(request,5000));}catch(e){return Response.json({error:'Invalid push subscription'},{status:e.status||400});}
 const hash=crypto.createHash('sha256').update(data.endpoint).digest('hex');
 const existing=await PushSubscription.findOne({endpointHash:hash});
 if(existing&&String(existing.userId)!==session.user.id)return Response.json({error:'Unsubscribe this browser from its previous account first'},{status:409});
 if(!existing&&await PushSubscription.countDocuments({userId:session.user.id})>=5)return Response.json({error:'Remove an old subscription first (maximum 5)'},{status:409});
 await PushSubscription.findOneAndUpdate({endpointHash:hash,userId:session.user.id},{$set:{...data,expiresAt:new Date(Date.now()+180*86400000)}},{upsert:true});
 return Response.json({ok:true});
}
export async function DELETE(request){
 const {session,error}=await requireAuth();if(error)return error;if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
 let endpoint;try{({endpoint}=await readSettingsJSON(request,3000));}catch(e){return Response.json({error:'Invalid subscription'},{status:e.status||400});}if(typeof endpoint!=='string'||endpoint.length>2048)return Response.json({error:'Invalid subscription'},{status:400});
 await PushSubscription.deleteOne({userId:session.user.id,endpointHash:crypto.createHash('sha256').update(endpoint).digest('hex')});return Response.json({ok:true});
}
