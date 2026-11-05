import {z} from 'zod';
import {deliveryGuard,deliveryFailure} from '@/lib/delivery-http';
import {readSettingsJSON} from '@/lib/settings-http';
import {getOperatingAreas,saveCountry,activateCountry} from '@/lib/operating-areas';
import {countries} from '@/lib/countries';
import {readiness} from '@/lib/operating-policy';
function view(record){return {...record,catalog:countries,readiness:Object.fromEntries(Object.keys(countries).map(code=>[code,readiness(code,record.countries[code])])),audit:record.audit.slice(-100).reverse().map(({at,actorId,action,country,revision})=>({at,actorId,action,country,revision}))};}
export async function GET(request){const {error}=await deliveryGuard(request,['admin']);if(error)return error;try{return Response.json(view(await getOperatingAreas()),{headers:{'Cache-Control':'no-store'}});}catch(e){return deliveryFailure(e);}}
async function mutate(request,activate){const {error,session}=await deliveryGuard(request,['admin']);if(error)return error;try{const b=await readSettingsJSON(request,2000000);if(!Number.isSafeInteger(b.revision)||b.revision<0)return Response.json({error:'Invalid revision'},{status:400});if(activate&&b.confirmed!==true)return Response.json({error:'Confirm activation explicitly'},{status:400});const record=activate?await activateCountry(b.country,b.revision,session.user):await saveCountry(b.country,b.config,b.revision,session.user);return Response.json({...view(record),message:activate?'Operating country activated successfully':'Settings saved successfully'});}catch(e){if(e instanceof z.ZodError)return Response.json({error:e.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')},{status:400});if(e.code===11000)return Response.json({error:'Settings changed. Refresh before saving.'},{status:409});return deliveryFailure(e);}}
export const PUT=request=>mutate(request,false);
export const POST=request=>mutate(request,true);
