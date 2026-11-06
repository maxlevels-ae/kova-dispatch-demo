import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import {readSettingsJSON} from '@/lib/settings-http';
import {readRiderContent,saveScopedContent,contentScopes} from '@/lib/rider-content';
import {countries} from '@/lib/countries';
import {activeOperations} from '@/lib/operating-areas';
export async function GET(request,{params}){const {error}=await requireAuth(['admin']);if(error)return error;const {scope}=await params;if(!contentScopes[scope])return Response.json({error:'Unknown content editor'},{status:404});try{const active=(await activeOperations()).country.code;return Response.json({...await readRiderContent(new URL(request.url).searchParams.get('country')||active,true),scope,activeCountry:active,countries:Object.values(countries).map(({code,name,arabic,center})=>({code,name,arabic,center}))},{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e.message},{status:e.status||503});}}
export async function PUT(request,{params}){const {error,session}=await requireAuth(['admin']);if(error)return error;if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});const {scope}=await params;try{const body=await readSettingsJSON(request,450000);return Response.json(await saveScopedContent(body.country,body,session.user.id,scope));}catch(e){return Response.json({error:e.message},{status:e.status||400});}}
