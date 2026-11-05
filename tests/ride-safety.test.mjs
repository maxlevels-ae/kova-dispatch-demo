import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProgress,rideSafetyDefaults as p,validFix} from '../src/lib/ride-safety-policy.js';
const now=Date.now(),pickup={lat:30.0444,lng:31.2357},dropoff={lat:30.05,lng:31.24};
const fix=(point,seconds)=>({...point,at:new Date(now-seconds*1000),accuracy:5});
const path=Array.from({length:7},(_,i)=>fix({lat:pickup.lat+(dropoff.lat-pickup.lat)*i/6,lng:pickup.lng+(dropoff.lng-pickup.lng)*i/6},60-i*10));
const check=s=>evaluateProgress(s,path[0].at,pickup,dropoff,p,now);
test('stationary trip cannot settle; genuine sampled progress to destination can',()=>{assert.equal(check(path.map(v=>({...v,...pickup}))).valid,false);assert.equal(check(path).valid,true);});
test('stale, inaccurate, missing and future fixes are rejected',()=>{for(const f of [null,fix(dropoff,61),{...fix(dropoff,0),accuracy:500},fix(dropoff,-1)])assert.ok(validFix(f,p,now));});
test('teleporting to destination is rejected despite proximity',()=>{const jumps=[fix(pickup,2),fix(dropoff,1),fix(dropoff,0)];assert.equal(check(jumps).valid,false);assert.equal(check(jumps).jumps,1);});
test('unobserved gaps do not count as travel',()=>{assert.equal(check([fix(pickup,100),fix(dropoff,0)]).valid,false);});
test('short journeys are supported but stationary GPS is insufficient',()=>{const end={lat:pickup.lat+.0003,lng:pickup.lng};const short=[fix(pickup,15),fix(end,0)];assert.equal(evaluateProgress(short,short[0].at,pickup,end,p,now).valid,true);assert.equal(evaluateProgress([short[0],fix(pickup,0)],short[0].at,pickup,end,p,now).valid,false);});
test('incoming sound keeps the exact fixed source, reports blocking, retries and stops',async()=>{
 const players=[];class AudioMock{constructor(src){this.src=src;this.paused=true;this.currentTime=0;this.block=true;players.push(this);}play(){if(this.block){const e=Error();e.name='NotAllowedError';return Promise.reject(e);}this.paused=false;this.currentTime=1;return Promise.resolve();}pause(){this.paused=true;}}
 globalThis.Audio=AudioMock;const a=await import('../src/lib/notification-audio.js');const offer={key:'offer:taxi',offer:true,expiresAt:new Date(Date.now()+10000).toISOString()};assert.equal(await a.playAlert(offer),false);assert.equal(a.audioStatus().blocked,true);players[0].block=false;assert.equal(await a.unlockAudio(),true);assert.equal(players[0].src,'/sounds/new-ride.mp3');assert.equal(players[0].loop,true);assert.equal(players[0].paused,false);await a.playAlert({key:'preview',offer:true,expiresAt:offer.expiresAt});assert.equal(players[0].paused,false);a.stopAlert('unrelated');assert.equal(players[0].paused,false);a.stopAlert('offer:taxi');assert.equal(players[0].paused,true);assert.equal(await a.playAlert({...offer,key:'offer:delivery'}),true);a.stopAlert();delete globalThis.Audio;
});

test('short-trip uncertainty cannot be counted as meaningful travel',()=>{const end={lat:pickup.lat+.0003,lng:pickup.lng};const samples=[{...fix(pickup,15),accuracy:50},{...fix(end,0),accuracy:50}];assert.equal(evaluateProgress(samples,samples[0].at,pickup,end,p,now).valid,false);});

test('movement before the server-recorded trip start never counts',()=>{const samples=[fix(pickup,25),fix(dropoff,10),fix(dropoff,0)];assert.equal(evaluateProgress(samples,new Date(now-15000),pickup,dropoff,p,now).valid,false);});

test('dense GPS updates preserve genuine slow movement without counting stationary jitter',()=>{const end={lat:pickup.lat+.001,lng:pickup.lng};const samples=Array.from({length:31},(_,i)=>({...fix({lat:pickup.lat+(end.lat-pickup.lat)*i/30,lng:pickup.lng},30-i),accuracy:10}));const result=evaluateProgress(samples,samples[0].at,pickup,end,p,now);assert.equal(result.valid,true);assert.ok(result.verifiedDistanceMeters>80);assert.equal(evaluateProgress(samples.map(s=>({...s,...pickup})),samples[0].at,pickup,end,p,now).valid,false);});
