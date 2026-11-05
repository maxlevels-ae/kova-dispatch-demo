import {requireAuth} from '@/lib/auth/helpers';
import {activeOperations} from '@/lib/operating-areas';
import {readRiderContent} from '@/lib/rider-content';
export async function GET(){const {error}=await requireAuth();if(error)return error;try{const operations=await activeOperations();return Response.json({...await readRiderContent(operations.country.code),operatingCountry:operations.country},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Home content is unavailable'},{status:503});}}
