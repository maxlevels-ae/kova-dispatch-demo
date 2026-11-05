import {bookingArea} from '@/lib/operating-areas';
import {z} from 'zod';
import {deliveryGuard,deliveryBody,deliveryFailure} from '@/lib/delivery-http';
import {getRoute} from '@/lib/services/routing';
const point=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).strict();
const schema=z.object({pickup:point,dropoff:point}).strict();
export async function POST(request){
 const {error}=await deliveryGuard(request,['rider']);if(error)return error;
 try{
  const {pickup,dropoff}=schema.parse(await deliveryBody(request));
  await bookingArea('delivery',pickup,dropoff);
  const route=await getRoute(pickup,dropoff);
  return Response.json({route:{...route,geometry:route.source==='osrm'?route.geometry:null},roadRouteAvailable:route.source==='osrm'}, {headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({error:'Choose valid pickup and dropoff locations.'},{status:400});return deliveryFailure(error);}
}
