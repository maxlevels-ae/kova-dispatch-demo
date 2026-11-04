import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 userId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},
 endpointHash:{type:String,unique:true,required:true},
 endpoint:{type:String,required:true,select:false},
 keys:{p256dh:{type:String,select:false},auth:{type:String,select:false}},
 expiresAt:{type:Date,required:true},
 lastError:String,
},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.models.PushSubscription||mongoose.model('PushSubscription',schema);
