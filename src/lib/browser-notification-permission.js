export async function browserNotificationPermission(){
 if(typeof Notification==='undefined')return 'unsupported';
 try{return(await navigator.permissions.query({name:'notifications'})).state;}catch{return Notification.permission;}
}
export async function closeOfferNotification(rideId){
 try{const registration=await navigator.serviceWorker?.getRegistration();const notices=await registration?.getNotifications();for(const n of notices||[])if(n.body==='New ride request'&&n.data?.href?.endsWith(String(rideId)))n.close();}catch{/* No browser notification was created. */}
}
