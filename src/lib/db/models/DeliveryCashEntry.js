import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 deliveryId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},actorId:{type:mongoose.Schema.Types.ObjectId,required:true},courierId:mongoose.Schema.Types.ObjectId,
 reference:{type:String,required:true,unique:true},receipt:{type:String,required:true,maxlength:200},
 kind:{type:String,enum:['fee_collection','cod_collection','remittance','fee_refund','cod_refund','cod_payout'],required:true},currency:{type:String,required:true},amount:{type:Number,required:true,min:0},
 payer:String,payee:String,createdAt:{type:Date,default:Date.now,immutable:true},
},{versionKey:false});
schema.pre('save',function(){if(!this.isNew)throw Error('Cash entries are immutable');});
for(const method of ['updateOne','updateMany','findOneAndUpdate','deleteOne','deleteMany','findOneAndDelete'])schema.pre(method,function(){throw Error('Cash entries are immutable');});
export default mongoose.models.DeliveryCashEntry||mongoose.model('DeliveryCashEntry',schema);
