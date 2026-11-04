import mongoose from 'mongoose';
import {requireAuth} from '@/lib/auth/helpers';
import VehiclePhoto from '@/lib/db/models/VehiclePhoto';
export async function GET(_request,{params}){const {error}=await requireAuth();if(error)return error;const {id}=await params;if(!mongoose.isValidObjectId(id))return new Response(null,{status:404});const photo=await VehiclePhoto.findById(id).lean();if(!photo)return new Response(null,{status:404});return new Response(new Uint8Array(Buffer.isBuffer(photo.bytes)?photo.bytes:photo.bytes.buffer),{headers:{'Content-Type':'image/webp','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});}
