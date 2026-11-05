import {requireAuth} from '@/lib/auth/helpers';
import {validSettingsOrigin} from '@/lib/settings-origin';
import {readSettingsJSON} from '@/lib/settings-http';
import {endRideEarly,EarlyEndError} from '@/lib/early-end-service';
import {serializeRide} from '@/lib/services/ride-service';
import mongoose from 'mongoose';
export async function POST(request,{params}){const {session,error}=await requireAuth(['driver']);if(error)return error;if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});try{const {id}=await params;if(!mongoose.isValidObjectId(id))return Response.json({error:'Invalid ride reference'},{status:400});const ride=await endRideEarly(id,session.user,await readSettingsJSON(request));return Response.json({ride:serializeRide(ride)});}catch(e){if(e instanceof EarlyEndError)return Response.json({error:e.message},{status:e.status});return Response.json({error:'Unable to process early-ending review'},{status:400});}}
