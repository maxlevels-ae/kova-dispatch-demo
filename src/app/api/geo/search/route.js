import {activeOperations,zoneAt} from '@/lib/operating-areas';
import {requireAuth} from '@/lib/auth/helpers';
import User from '@/lib/db/models/User';
import Ride from '@/lib/db/models/Ride';
import Delivery from '@/lib/db/models/Delivery';
import {readRiderContent} from '@/lib/rider-content';
import {expandedPlaceQuery,matchesPlace,rankPlaces} from '@/lib/place-search';
import {jordanLandmarkDrafts} from '@/lib/jordan-landmarks';
const PHOTON_BASE=process.env.PHOTON_URL||'https://photon.komoot.io';
// Cache only public provider results; never cache account locations globally.
const cache=new Map();
function feature(f){const p=f.properties||{},parts=[p.name,p.street,p.housenumber,p.district,p.city,p.state,p.country].filter(Boolean);return {name:p.name||p.street||p.city||'Place',address:[...new Set(parts)].join(', '),lat:f.geometry?.coordinates?.[1],lng:f.geometry?.coordinates?.[0],type:p.osm_value||p.type||'',priority:3};}
async function provider(url){const cached=cache.get(url);if(cached&&cached.expires>Date.now())return cached.results;let response=await fetch(url,{signal:AbortSignal.timeout(3000),headers:{'User-Agent':'Maxride/1.0'}});if(response.status===400&&new URL(url).searchParams.has('lang')){const fallback=new URL(url);fallback.searchParams.delete('lang');response=await fetch(fallback,{signal:AbortSignal.timeout(3000),headers:{'User-Agent':'Maxride/1.0'}});}if(!response.ok)throw Error('Provider unavailable');const results=(await response.json()).features?.map(feature)||[];if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(url,{results,expires:Date.now()+60000});return results;}
const output=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request){
 const {error,session}=await requireAuth();if(error)return error;
 try{
  const p=request.nextUrl.searchParams,q=(p.get('q')||'').trim().slice(0,120),lat=Number(p.get('lat')),lng=Number(p.get('lng')),reverse=p.get('reverse')==='1';
  const valid=p.has('lat')&&p.has('lng')&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
  if(reverse&&!valid)return output({error:'Valid coordinates are required'},400);
  const operations=await activeOperations(),bias=valid?{lat,lng}:operations.country.center;
  const annotate=rows=>rows.map(row=>({...row,availability:{taxi:!!zoneAt(operations,row,'taxi'),delivery:!!zoneAt(operations,row,'delivery')}}));
  if(reverse){try{return output({results:annotate(await provider(`${PHOTON_BASE}/reverse?lon=${lng}&lat=${lat}&limit=1`))});}catch{return output({results:[],error:'Address lookup is temporarily unavailable'},502);}}
  const language=p.get('lang')==='ar'?'ar':'en';
  const locals=async()=>{
   const [account,rides,deliveries,cms]=await Promise.all([User.findById(session.user.id).select('savedPlaces').lean(),Ride.find({riderId:session.user.id}).sort({createdAt:-1}).limit(12).select('pickup dropoff').lean(),Delivery.find({customerId:session.user.id}).sort({createdAt:-1}).limit(12).select('pickup dropoff').lean(),readRiderContent(operations.country.code)]);
   const points=(items,priority)=>items.map(item=>({name:item.label||item.address,address:item.address,lat:item.lat??item.location?.coordinates?.[1],lng:item.lng??item.location?.coordinates?.[0],priority}));
   const landmarks=[...cms.content.destinations.filter(x=>x.verified),...(operations.country.code==='JO'?jordanLandmarkDrafts:[])];
   return [...points(account?.savedPlaces||[],0),...points([...rides,...deliveries].flatMap(r=>[r.pickup,r.dropoff]).filter(Boolean),1),...landmarks.map(x=>({name:language==='ar'?x.nameAr:x.nameEn,address:x.address||x.nameEn,lat:x.lat,lng:x.lng,priority:2,aliases:[x.nameEn,x.nameAr]}))].filter(x=>!q||matchesPlace(q,x.name,x.address,...(x.aliases||[])));
  };
  const remote=q.length>=2?provider(`${PHOTON_BASE}/api/?q=${encodeURIComponent(expandedPlaceQuery(q)+', '+operations.country.name)}&limit=12&lat=${bias.lat}&lon=${bias.lng}&lang=${language}&location_bias_scale=0.4`):Promise.resolve([]);
  const [local,external]=await Promise.allSettled([locals(),remote]);
  const results=annotate(rankPlaces([...(local.status==='fulfilled'?local.value:[]),...(external.status==='fulfilled'?external.value:[])],bias));
  return output({results,...(external.status==='rejected'?{warning:'Place provider is temporarily unavailable. Saved and recent places are still shown.'}:{})},external.status==='rejected'&&!results.length?502:200);
 }catch{return output({results:[],error:'Place search is temporarily unavailable'},503);}
}
