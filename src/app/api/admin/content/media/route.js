import sharp from 'sharp';
import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import {readSettingsJSON} from '@/lib/settings-http';
import {countries} from '@/lib/countries';
import Media from '@/lib/db/models/RiderContentMedia';
export async function POST(request){const {session,error}=await requireAuth(['admin']);if(error)return error;if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});try{
 const {image,country}=await readSettingsJSON(request,2900000);if(!Object.hasOwn(countries,country))throw Error('Choose a supported country');const match=typeof image==='string'&&/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);if(!match)throw Error('Upload a PNG, JPEG or WebP image');const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>2*1024*1024)throw Error('Image must be at most 2 MB');const decoded=sharp(bytes,{limitInputPixels:16000000,failOn:'warning'}),meta=await decoded.metadata();if(meta.format!==match[1]||(meta.pages||1)!==1||meta.width<32||meta.height<32)throw Error('Use a static image at least 32 × 32 pixels');const {data,info}=await decoded.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer({resolveWithObject:true});const row=await Media.create({country,bytes:data,width:info.width,height:info.height,uploadedBy:session.user.id});return Response.json({image:'/api/rider-content/media/'+row._id,width:info.width,height:info.height});
 }catch(e){return Response.json({error:e.message||'Upload failed'},{status:e.status||400});}}
