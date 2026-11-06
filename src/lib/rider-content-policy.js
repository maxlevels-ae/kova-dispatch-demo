import {z} from 'zod';
export const contentCountry=z.string().regex(/^[A-Z]{2}$/);
const text=(max=160)=>z.string().trim().max(max);
const media=z.string().regex(/^$|^\/api\/rider-content\/media\/[a-f0-9]{24}$/);
export const contentAction=z.enum(['none','ride','delivery','explore','wallet']);
const common={id:z.string().uuid(),active:z.boolean(),archived:z.boolean(),image:media,updatedAt:z.string().optional()};
export const riderContentSchema=z.object({
 exploreTitleEn:text(),exploreTitleAr:text(),exploreCtaEn:text(60),exploreCtaAr:text(60),exploreAction:z.enum(['explore','ride','delivery']),loginImage:media,
 heroes:z.array(z.object({...common,headlineEn:text(),headlineAr:text(),subtitleEn:text(240),subtitleAr:text(240),action:contentAction})).max(12),
 destinations:z.array(z.object({...common,nameEn:text(100),nameAr:text(100),shortEn:text(300),shortAr:text(300),descriptionEn:text(4000),descriptionAr:text(4000),regionEn:text(150),regionAr:text(150),cityEn:text(150).optional(),cityAr:text(150).optional(),sourceUrl:z.string().url().optional(),address:text(300),lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),verified:z.boolean(),gallery:z.array(media).max(3)})).max(100),
}).strict().superRefine((v,ctx)=>{
 const ids=[...v.heroes,...v.destinations].map(x=>x.id);if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Each content item needs a unique ID.'});
 for(const [kind,rows] of [['heroes',v.heroes],['destinations',v.destinations]])rows.forEach((r,i)=>{if(r.active&&!r.archived&&(!r.image||!(kind==='heroes'?r.headlineEn&&r.headlineAr:r.nameEn&&r.nameAr&&r.verified)))ctx.addIssue({code:'custom',path:[kind,i],message:'Active content requires an image, English and Arabic text, and verified destination coordinates.'});});
});
export const emptyRiderContent=()=>({exploreTitleEn:'Explore',exploreTitleAr:'استكشف',exploreCtaEn:'Explore all',exploreCtaAr:'استكشف الكل',exploreAction:'explore',loginImage:'',heroes:[],destinations:[]});
export function visibleRiderContent(v){return {...v,heroes:v.heroes.filter(x=>x.active&&!x.archived),destinations:v.destinations.filter(x=>x.active&&!x.archived)};}
export function contentImages(v){return [...new Set([v.loginImage,...v.heroes.map(x=>x.image),...v.destinations.flatMap(x=>[x.image,...x.gallery])].filter(Boolean))];}
