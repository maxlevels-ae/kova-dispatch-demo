import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import {requireAuth} from '@/lib/auth/helpers';
import Media from '@/lib/db/models/RiderContentMedia';
export async function GET(_request,{params}){const {id}=await params;if(!mongoose.isValidObjectId(id))return new Response(null,{status:404});await connectDB();const row=await Media.findById(id).select('+bytes').lean();if(!row)return new Response(null,{status:404});if(!row.published){const {error}=await requireAuth(['admin']);if(error)return error;}return new Response(new Uint8Array(Buffer.isBuffer(row.bytes)?row.bytes:row.bytes.buffer),{headers:{'Content-Type':'image/webp','Cache-Control':row.published?'public, max-age=3600':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}
