import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import {readSettingsJSON} from '@/lib/settings-http';
import {readRiderContent,saveScopedContent} from '@/lib/rider-content';
import {jordanLandmarkDrafts} from '@/lib/jordan-landmarks';
import {normalizePlaceName} from '@/lib/place-search';
export async function POST(request){const {session,error}=await requireAuth(['admin']);if(error)return error;if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});try{
 const {revision}=await readSettingsJSON(request,2000),prior=await readRiderContent('JO',true);if(prior.revision!==revision)return Response.json({error:'Content changed. Reload before saving.'},{status:409});
 const existing=[...prior.draft.destinations,...(prior.published?.destinations||[])],names=new Set(existing.flatMap(x=>[x.nameEn,x.nameAr].map(normalizePlaceName)));
 const missing=jordanLandmarkDrafts.filter(x=>!existing.some(e=>e.id===x.id)&&!names.has(normalizePlaceName(x.nameEn))&&!names.has(normalizePlaceName(x.nameAr)));
 if(!missing.length)return Response.json({...prior,message:'All Jordanian drafts already exist. No content changed.'});
 const result=await saveScopedContent('JO',{revision,publish:false,value:{destinations:[...prior.draft.destinations,...missing]}},session.user.id,'landmarks');return Response.json({...result,added:missing.length,message:missing.length+' inactive Jordanian drafts added. Published content is unchanged.'});
 }catch(e){return Response.json({error:e.message},{status:e.status||400});}}
