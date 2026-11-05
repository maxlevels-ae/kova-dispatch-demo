import {translate} from '@/lib/i18n';
import {visibleRiderContent,emptyRiderContent} from '@/lib/rider-content-policy';
export const riderAsset=name=>'/rider-assets/'+name;
export function referenceValues(content,language,options={}){
 const t=value=>translate(value,language),v=visibleRiderContent(content||emptyRiderContent()),index=Math.min(options.hero||0,Math.max(0,v.heroes.length-1)),local=(row,name)=>row[name+(language==='ar'?'Ar':'En')],noop=()=>{};
 const action=name=>()=>options.onAction?.(name),sights=v.destinations.map(d=>({...d,name:local(d,'name'),ar:language==='ar'?d.nameEn:d.nameAr,loc:local(d,'region'),region:local(d,'region'),info:local(d,'description'),bg:`url("${d.image}") center / cover`,gal:d.gallery.filter(Boolean).map(image=>`url("${image}") center / cover`),km:local(d,'region'),time:local(d,'short'),distanceLabel:t('Select pickup for distance'),durationLabel:t('Route estimate pending'),open:()=>options.onPlace?.(d.id)}));
 const profile=options.profile||{};
 return {
  isHome:false,isMap:false,isSearch:false,isOptions:false,isFinding:false,isDrive:false,isRate:false,isGrid:false,isPlace:false,isCancelled:false,isArriving:false,isTrip:false,showSos:false,showCancel:false,showPay:false,
  menuHidden:true,menuPE:'none',menuOp:0,menuX:language==='ar'?'330px':'-330px',menuTop:[],menuItems:[],saved:[],places:[],rides:[],payOpts:[],reasons:[],stars:[],pl:sights.find(x=>x.id===options.place)||{gal:[]},
  firstName:profile.name?.split(' ')[0]||'—',fullName:profile.name||'—',userRating:profile.rating?.count?Number(profile.rating.average).toFixed(2):'—',greeting:t('Good morning,'),avatar:options.avatar,
  exploreTitle:local(v,'exploreTitle'),exploreCta:local(v,'exploreCta'),exploreAll:action(v.exploreAction),sights,
  heroX:(language==='ar'?1:-1)*index*100+'%',noHeroes:!v.heroes.length,
  slides:v.heroes.map(h=>({...h,t1:local(h,'headline'),t2:local(h,'subtitle'),bg:`url("${h.image}") center / cover`,go:action(h.action),key:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action(h.action)();}}})),
  dots:v.heroes.map((h,i)=>({id:h.id,label:t('Banner')+' '+(i+1),w:index===i?'20px':'7px',c:index===i?'#111':'#cfc8bd',go:()=>options.onHero?.(i)})),nextHero:()=>options.onHero?.((index+1)%Math.max(1,v.heroes.length)),
  goHome:action('home'),goMap:action('ride'),goSearch:action('search'),goDelivery:action('delivery'),savedHome:action('savedHome'),savedWork:action('savedWork'),savedPlaces:action('saved'),history:action('trips'),wallet:action('wallet'),openMenu:action('account'),closeMenu:noop,signOut:noop,
  taxiDisabled:false,deliveryDisabled:false,busy:false,closePay:noop,payKey:noop,openPay:noop,book:noop,openCancel:noop,closeCancel:noop,confirmCancel:noop,copyPin:noop,openChat:noop,callDriver:noop,shareTrip:noop,openSos:noop,closeSos:noop,sosCall:noop,sosShare:noop,submitRating:noop,bookPlace:noop,
 };
}
