// Fixed-source players: unlocking the incoming asset must not swap sources later.
let incoming, message, activeKey=null, desired=null, timer, generation=0, unlockInFlight=null;
let status={ready:false,blocked:false,error:''};
const listeners=new Set();
export function audioStatus(){return status;}
export function subscribeAudio(listener){listeners.add(listener);return()=>listeners.delete(listener);}
function report(patch){status={...status,...patch};for(const listener of listeners)listener(status);}
function players(){
 if(typeof Audio==='undefined')return false;
 incoming ||= new Audio('/sounds/new-ride.mp3');message ||= new Audio('/sounds/all-notify.mp3');
 incoming.preload='auto';message.preload='auto';incoming.volume=1;message.volume=1;return true;
}
export function stopAlert(key){
 if(key&&activeKey!==key&&desired?.key!==key)return;
 generation++;for(const player of [incoming,message])if(player){player.pause();player.currentTime=0;}
 clearTimeout(timer);activeKey=null;desired=null;
}
function expires(offer,expiresAt){return offer&&(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now());}
export async function playAlert({key='preview',offer=false,expiresAt}={}){
 // A message received during a cold Go Online click must not pause the real
 // incoming player before its first permitted play() promise resolves.
 if(!offer&&unlockInFlight)await unlockInFlight.catch(()=>{});
 if(!players()||expires(offer,expiresAt))return false;
 if(activeKey===key&&!(offer?incoming:message).paused)return true;
 if(desired?.offer&&(!offer||key==='preview'&&desired.key!=='preview'))return true;
 stopAlert();const version=generation;activeKey=key;desired={key,offer,expiresAt};
 const player=offer?incoming:message;player.loop=offer;
 if(offer)timer=setTimeout(()=>stopAlert(key),Date.parse(expiresAt)-Date.now());
 player.onended=()=>{if(!player.loop&&generation===version){activeKey=null;desired=null;}};
 try{await player.play();if(generation!==version){if(activeKey===null)player.pause();return false;}if(offer)report({ready:true,blocked:false,error:''});return true;}
 catch(error){if(generation!==version)return false;player.pause();if(offer)report({ready:false,blocked:true,error:error.name==='NotAllowedError'?'Sound is blocked. Tap Retry ride alerts and check your browser or device sound settings.':'Incoming sound could not play. Check your connection and device audio settings.'});return false;}
}
export async function unlockAudio(){
 if(!players())return false;
 if(desired?.offer&&!expires(true,desired.expiresAt))return playAlert(desired);
 stopAlert();const version=generation;incoming.loop=false;
 // Called synchronously from the click handler, with audible volume and the
 // exact incoming asset. A muted play is not treated as an audio unlock.
 let attempt;
 try{attempt=incoming.play();unlockInFlight=attempt;await attempt;if(version===generation){incoming.pause();incoming.currentTime=0;}report({ready:true,blocked:false,error:''});return true;}
 catch(error){report({ready:false,blocked:true,error:error.name==='NotAllowedError'?'Sound is blocked. Tap Retry ride alerts and check your browser or device sound settings.':'Incoming sound could not play. Check your connection and device audio settings.'});return false;}
 finally{if(unlockInFlight===attempt)unlockInFlight=null;}
}
