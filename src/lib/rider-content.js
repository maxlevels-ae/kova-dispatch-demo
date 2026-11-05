import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import RiderContent from '@/lib/db/models/RiderContent';
import Media from '@/lib/db/models/RiderContentMedia';
import {countries} from '@/lib/countries';
import {contains,countryBoundaries} from '@/lib/operating-geometry';
import {riderContentSchema,emptyRiderContent,contentImages,visibleRiderContent} from '@/lib/rider-content-policy';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export async function readRiderContent(country,admin=false){
 if(!Object.hasOwn(countries,country))fail('Unsupported country');await connectDB();const row=await RiderContent.findById(country).lean();
 if(admin)return {country,revision:row?.revision||0,draft:row?.draft||emptyRiderContent(),published:row?.published||null,publishedRevision:row?.publishedRevision||0,publishedAt:row?.publishedAt||null,history:(row?.history||[]).map(({actor,at,action,revision})=>({actor,at,action,revision}))};
 return {country,revision:row?.publishedRevision||0,content:visibleRiderContent(row?.published||emptyRiderContent())};
}
export async function saveRiderContent(country,input,actor){
 if(!Object.hasOwn(countries,country))fail('Unsupported country');if(!Number.isInteger(input.revision)||input.revision<0||typeof input.publish!=='boolean')fail('Invalid revision or publishing action');
 const parsed=riderContentSchema.safeParse(input.value);if(!parsed.success)fail(parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));const value=parsed.data;
 for(const item of value.destinations){if(item.verified&&!contains(countryBoundaries[country],item))fail('Verified destination coordinates must lie within the selected country.');}
 await connectDB();const session=await mongoose.startSession();try{await session.withTransaction(async()=>{
  const ids=contentImages(value).map(x=>x.split('/').at(-1));if(await Media.countDocuments({_id:{$in:ids},country}).session(session)!==ids.length)fail('Upload valid images for this country before saving.');
  const prior=await RiderContent.findById(country).session(session);if((prior?.revision||0)!==input.revision)fail('Content changed. Reload before saving.',409);
  // Archiving preserves existing item IDs and the bounded historical snapshots.
  if(prior)for(const key of ['heroes','destinations'])for(const item of prior.draft[key])if(!value[key].some(x=>x.id===item.id))fail('Archive existing entries instead of deleting their history.');
  const revision=input.revision+1,at=new Date(),publish=input.publish?{published:value,publishedRevision:revision,publishedAt:at}:{};
  const row=await RiderContent.findOneAndUpdate({_id:country,revision:input.revision},{$set:{draft:value,...publish},$inc:{revision:1},$push:{history:{$each:[{actor,at,action:input.publish?'publish':'draft',revision,value}],$slice:-20}}},{session,upsert:!prior,returnDocument:'after'});
  if(!row)fail('Content changed. Reload before saving.',409);
  if(input.publish){const publicIds=contentImages(visibleRiderContent(value)).map(x=>x.split('/').at(-1));await Media.updateMany({_id:{$in:publicIds},country},{$set:{published:true}},{session});}
 });}catch(e){if(e.code===11000)fail('Content changed. Reload before saving.',409);throw e;}finally{await session.endSession();}
 return {...await readRiderContent(country,true),message:input.publish?'Content published successfully':'Draft saved successfully — customer content has not changed'};
}
