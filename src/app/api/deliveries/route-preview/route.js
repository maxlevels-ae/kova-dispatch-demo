import {z} from 'zod';
import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {getRoute} from '@/lib/services/routing';
const point=z.object({lat:z.number().min(22).max(32),lng:z.number().min(24).max(37)}).strict();
const schema=z.object({pickup:point,dropoff:point}).strict();
export async function POST(request){
 const {error}=await deliveryGuard(request,['rider']);if(error)return error;
 try{
  const {pickup,dropoff}=schema.parse(await deliveryBody(request));
  const route=await getRoute(pickup,dropoff);
  return Response.json({route:{...route,geometry:route.source==='osrm'?route.geometry:null},roadRouteAvailable:route.source==='osrm'}, {headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({error:'Choose valid pickup and dropoff locations in Egypt.'},{status:400});return deliveryFailure(error);}
}
