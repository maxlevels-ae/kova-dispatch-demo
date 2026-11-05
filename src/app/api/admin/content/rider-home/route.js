import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import {readSettingsJSON} from '@/lib/settings-http';
import {readRiderContent,saveRiderContent} from '@/lib/rider-content';
import {countries} from '@/lib/countries';
import {activeOperations} from '@/lib/operating-areas';
export async function GET(request){const {error}=await requireAuth(['admin']);if(error)return error;try{const active=(await activeOperations()).country.code;return Response.json({...await readRiderContent(new URL(request.url).searchParams.get('country')||active,true),activeCountry:active,countries:Object.values(countries).map(({code,name,arabic,center})=>({code,name,arabic,center}))},{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e.message},{status:e.status||503});}}
export async function PUT(request){const {session,error}=await requireAuth(['admin']);if(error)return error;if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});try{const body=await readSettingsJSON(request,450000);return Response.json(await saveRiderContent(body.country,body,session.user.id));}catch(e){return Response.json({error:e.message||'Unable to save content'},{status:e.status||503});}}
