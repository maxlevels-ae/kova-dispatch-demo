import mongoose from 'mongoose';
import {deliveryTransitions} from '@/lib/delivery-policy';
const id=mongoose.Schema.Types.ObjectId,Mixed=mongoose.Schema.Types.Mixed;
const schema=new mongoose.Schema({
 customerId:{type:id,required:true,index:true},recipientId:{type:id,index:true},courierId:{type:id,index:true},driverProfileId:id,
 recipientType:{type:String,enum:['registered','guest']},verificationMethod:{type:String,enum:['account_otp','private_link']},
 guestAccess:{hash:{type:String,select:false},expiresAt:Date,revokedAt:Date},
 idempotencyKey:{type:String,required:true,unique:true},status:{type:String,enum:Object.keys(deliveryTransitions),default:'CREATED',index:true},
 pickup:Mixed,dropoff:Mixed,sender:Mixed,recipient:Mixed,package:Mixed,region:String,route:Mixed,quote:Mixed,fare:Mixed,policy:Mixed,operations:Mixed,vehicle:Mixed,
 timeline:[{status:String,event:String,at:{type:Date,default:Date.now},actorId:id,role:String,note:String}],
 messages:[{clientId:String,senderId:id,role:String,text:String,at:{type:Date,default:Date.now}}],
 offer:{id:String,courierId:id,profileId:id,expiresAt:Date},attempted:[id],attempts:{type:Number,default:0},manualHold:{type:Boolean,default:false},
 pickupCode:{hash:{type:String,select:false},cipher:{type:String,select:false},expiresAt:Date,attempts:{type:Number,default:0},verifiedAt:Date},
 deliveryCode:{hash:{type:String,select:false},cipher:{type:String,select:false},expiresAt:Date,attempts:{type:Number,default:0},verifiedAt:Date},
 proof:{photoId:id,confirmedAt:Date,recipientConfirmed:{type:Boolean,default:false},recipientId:id},
 settlement:{status:{type:String,default:'pending'},at:Date},arrivedAt:Date,pickedUpAt:Date,deliveredAt:Date,cancelledAt:Date,
},{timestamps:true});
schema.index({status:1,createdAt:-1});
export default mongoose.models.Delivery||mongoose.model('Delivery',schema);
