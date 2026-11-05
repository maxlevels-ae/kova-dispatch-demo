import {activeOperations} from '@/lib/operating-areas';
import {readRiderContent} from '@/lib/rider-content';
export async function GET(){try{const {country}=await activeOperations();const {content}=await readRiderContent(country.code);return Response.json({country:country.code,image:content.loginImage},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({image:''},{headers:{'Cache-Control':'no-store'}});}}
