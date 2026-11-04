import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    _id: mongoose.Schema.Types.ObjectId,
    inApp: { type: Boolean, default: true },
    driverSound: {type:Boolean,default:true},
    riderSound: {type:Boolean,default:true},
    messages: {type:Boolean,default:true},
    rideEvents: {type:Boolean,default:true},
    browser: {type:Boolean,default:true},
    push: {type:Boolean,default:true},
    muted: {type:Boolean,default:false},
  },
  { timestamps: true },
);
export default mongoose.models.NotificationPreference ||
  mongoose.model("NotificationPreference", schema);
