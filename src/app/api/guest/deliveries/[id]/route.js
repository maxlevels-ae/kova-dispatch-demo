import {validSettingsOrigin} from '@/lib/settings-origin';
import {guestDelivery,guestLimit} from '@/lib/delivery-guest';
import {deliveryFailure} from '@/lib/delivery-http';
export async function POST(request,{params}){
 if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
 try{
  const ip=request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown';
  await guestLimit('ip:'+ip,120);
  const {id}=await params,token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  return Response.json(await guestDelivery(id,token),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){return deliveryFailure(error);}
}
