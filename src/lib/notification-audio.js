// One player per app tab. Audio is unlocked only in a real user gesture.
let player,unlocked=false,activeKey=null,timer;
export function stopAlert(){if(player){player.pause();player.currentTime=0;}clearTimeout(timer);activeKey=null;}
export async function unlockAudio(){
 if(typeof Audio==='undefined')return false;
 player ||= new Audio('/sounds/all-notify.mp3');
 player.volume=0;
 try{await player.play();player.pause();player.currentTime=0;player.volume=1;unlocked=true;return true;}catch{player.volume=1;return false;}
}
export async function playAlert({key='preview',offer=false,expiresAt}={}){
 if(!unlocked)return false;
 if(activeKey===key&&!player?.paused)return true;
 // A message cannot interrupt an active offer ring.
 if(activeKey?.startsWith('offer:')&&!offer)return true;
 stopAlert();activeKey=key;
 player.src=offer?'/sounds/new-ride.mp3':'/sounds/all-notify.mp3';player.loop=offer;player.onended=()=>{if(!player.loop)activeKey=null;};
 try{await player.play();if(offer)timer=setTimeout(stopAlert,Math.max(0,Math.min(25000,Date.parse(expiresAt)-Date.now()||16000)));return true;}catch{stopAlert();return false;}
}
