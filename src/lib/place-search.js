// Matching aliases are names, never substitute coordinates. Coordinates come from
// the map provider, the account's own records or published verified CMS content.
export function normalizePlaceName(value='') {
 return value.normalize('NFKD').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export const placeAliases=[['Abdoun','عبدون'],['Khalda','خلدا','خالدا'],['Sweifieh','Swefieh','الصويفية','الصويفيه'],['Petra','البتراء'],['Wadi Rum','وادي رم']];
export function expandedPlaceQuery(query){const normalized=normalizePlaceName(query);return placeAliases.find(group=>group.some(name=>normalizePlaceName(name)===normalized))?.[0]||query;}
export function matchesPlace(query,...names){const q=normalizePlaceName(query),expanded=normalizePlaceName(expandedPlaceQuery(query));return names.some(name=>{const n=normalizePlaceName(name);return n.includes(q)||n.includes(expanded);});}
export function placeDistance(a,b){if(!a||!b)return Infinity;const rad=Math.PI/180;const dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
export function rankPlaces(rows,bias){const seen=new Set();return rows.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180).sort((a,b)=>(a.priority??3)-(b.priority??3)||placeDistance(bias,a)-placeDistance(bias,b)).filter(p=>{const key=p.lat.toFixed(4)+','+p.lng.toFixed(4);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12);}
