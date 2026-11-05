import mongoose from 'mongoose';
import OperatingAreas from '@/lib/db/models/OperatingAreas';
import OperatingAreaAudit from '@/lib/db/models/OperatingAreaAudit';
import connectDB from '@/lib/db/mongodb';
import {countries} from '@/lib/countries';
import {initialCountries,countryConfigSchema,readiness} from '@/lib/operating-policy';
import {countryBoundaries,contains,geometryError} from '@/lib/operating-geometry';
import {getSettings} from '@/lib/settings';
import {getDeliverySettings} from '@/lib/delivery-settings';
import {cityCenter} from '@/lib/map-config';
import {walletAccount} from '@/lib/currency';
import {haversineDistance} from '@/lib/utils/geo';
export class AreaError extends Error{constructor(message,status=409){super(message);this.status=status;}}
export async function getOperatingAreas(){
 await connectDB();const record=await OperatingAreas.findById('global').lean();if(record)return record;
 const configs=initialCountries(),s=await getSettings();configs.EG.dispatch={assignmentMode:s.dispatch.assignmentMode,scheduledEnabled:s.dispatch.scheduledEnabled,maxScheduleDays:s.dispatch.maxScheduleDays,maxTripKm:s.dispatch.maxTripKm,maxDailyTrips:s.fleet.maxDailyTrips,radiusKm:s.dispatch.searchRadiusKm,acceptanceSeconds:s.dispatch.acceptanceSeconds,maxAttempts:s.dispatch.maxAttempts};configs.EG.hours={start:s.dispatch.serviceStartHour,end:s.dispatch.serviceEndHour};configs.EG.vehicles=s.fleet.enabledCategories;configs.EG.documents=s.fleet.requiredDocuments;
 configs.EG.center=cityCenter(s.maps);const delivery=(await getDeliverySettings()).settings;configs.EG.deliveryDispatch=delivery.dispatch;configs.EG.deliveryHours={start:delivery.general.startHour,end:delivery.general.endHour};
 return {_id:'global',activeCountry:'EG',revision:0,countries:configs,audit:[]};
}
export function enabledZones(config,service){return config.zones.filter(z=>z.active&&z[service]&&config.activeCities.includes(z.city));}
export function zoneAt(snapshot,point,service){if(!contains(countryBoundaries[snapshot.country.code],point))return null;return enabledZones(snapshot.config,service).filter(z=>contains(z.geometry,point)).sort((a,b)=>a.id.localeCompare(b.id))[0]||null;}
export async function activeOperations(){const record=await getOperatingAreas();return {country:countries[record.activeCountry],config:record.countries[record.activeCountry],revision:record.revision};}
export async function bookingArea(service,pickup,dropoff,at=new Date()){
 const snapshot=await activeOperations();const {country,config}=snapshot;
 if(!config[service]||readiness(country.code,config).some(v=>v.startsWith(service+':')))throw new AreaError('Service is not available in this area.');
 const p=zoneAt(snapshot,pickup,service),d=zoneAt(snapshot,dropoff,service);if(!p||!d)throw new AreaError('This location is outside the active service zone.',400);
 const hour=Number(new Intl.DateTimeFormat('en',{timeZone:country.timeZone,hour:'numeric',hourCycle:'h23'}).format(at));if(hour<(service==='delivery'?config.deliveryHours:config.hours).start||hour>=(service==='delivery'?config.deliveryHours:config.hours).end)throw new AreaError('Booking is outside local operating hours.',400);
 return {...snapshot,pickupZone:p.id,dropoffZone:d.id,recordedAt:new Date().toISOString()};
}
export async function saveCountry(code,input,revision,actor){
 if(!Object.hasOwn(countries,code))throw new AreaError('Unsupported country',400);
 const config=countryConfigSchema.parse(input);
 if(!contains(countryBoundaries[code],config.center))throw new AreaError('Map center must be inside the selected country',400);
 if(config.activeCities.some(city=>!countries[code].cities.some(c=>c.name===city)))throw new AreaError('Choose cities from the country catalog',400);
 const ids=new Set();for(const zone of config.zones){if(ids.has(zone.id)||zone.country!==code)throw new AreaError('Duplicate zone ID or wrong country',400);ids.add(zone.id);const city=countries[code].cities.find(c=>c.name===zone.city&&c.province===zone.province);if(!city)throw new AreaError('Choose a valid city and province',400);const error=geometryError(zone.geometry,code);if(error)throw new AreaError(error,400);}
 return mongoose.connection.transaction(async session=>{
  const current=await getOperatingAreas();if(current.revision!==revision)throw new AreaError('Settings changed. Refresh before saving.');
  const old=current.countries[code];if(old.zones.some(z=>!ids.has(z.id)))throw new AreaError('Historical zones cannot be deleted. Disable them instead.',400);
  const now=new Date();config.zones=config.zones.map(z=>({...z,createdAt:old.zones.find(v=>v.id===z.id)?.createdAt||now.toISOString(),updatedAt:now.toISOString()}));
  const event={at:now,actorId:actor.id,action:'country.saved',country:code,revision:revision+1,changes:{before:old,after:config}};
  const {changes,...summary}=event;
  if(!revision){const exists=await OperatingAreas.findById('global').session(session);if(!exists){await OperatingAreas.create([{...current,countries:{...current.countries,[code]:config},revision:1,audit:[summary]}],{session});await OperatingAreaAudit.create([{...summary,changes}],{session});return getOperatingAreasAfter(session);}}
  const updated=await OperatingAreas.findOneAndUpdate({_id:'global',revision},{$set:{['countries.'+code]:config},$inc:{revision:1},$push:{audit:{$each:[summary],$slice:-100}}},{session,returnDocument:'after'}).lean();if(!updated)throw new AreaError('Settings changed. Refresh before saving.');await OperatingAreaAudit.create([event],{session});return updated;
 });
}
async function getOperatingAreasAfter(session){return OperatingAreas.findById('global').session(session).lean();}
export async function activateCountry(code,revision,actor){
 if(!Object.hasOwn(countries,code))throw new AreaError('Unsupported country',400);
 const current=await getOperatingAreas();const blockers=readiness(code,current.countries[code]);if(blockers.length)throw new AreaError(blockers.join('; '),400);
 if(current.revision!==revision)throw new AreaError('Settings changed. Refresh before activation.');
 return mongoose.connection.transaction(async session=>{const event={at:new Date(),actorId:actor.id,action:'country.activated',country:code,revision:revision+1,changes:{from:current.activeCountry,to:code}};
 const result=await OperatingAreas.findOneAndUpdate({_id:'global',revision},{$set:{activeCountry:code},$inc:{revision:1},$push:{audit:{$each:[event],$slice:-100}}},{session,returnDocument:'after'}).lean();if(!result)throw new AreaError('Save the country configuration before activation.');await OperatingAreaAudit.create([event],{session});return result;});
}
export function courierReadiness(driver,user,{snapshot,service='delivery',pickup,policy,currency}={}){
 const reasons=[],add=(code,message)=>reasons.push({code,message});const config=snapshot?.config,localCurrency=currency||snapshot?.country.currency||'EGP';
 if(!user?.isActive)add('account_inactive','Driver account is inactive or missing');
 if(policy?.eligibility?.available===false)add('delivery_disabled','Delivery courier availability is disabled');
 if(!driver.isApproved)add('not_approved','Driver is not approved');
 if(!driver.isOnline)add('offline','Driver is offline');
 if(service==='delivery'?driver.services?.deliveries!==true:driver.services?.rides===false)add('service_opt_out',service+' requests are disabled');
 const point=driver.lastLocationUpdate&&driver.location?.coordinates?.length===2?{lng:driver.location.coordinates[0],lat:driver.location.coordinates[1]}:null;
 const age=driver.lastLocationUpdate?Date.now()-new Date(driver.lastLocationUpdate):Infinity;
 if(!point)add('gps_missing','No reported GPS update is recorded');else if(!Number.isFinite(age)||age>90000||age< -30000)add('gps_stale','GPS is stale or has an invalid timestamp');
 let zone=null;if(snapshot){if(driver.operatingCountry&&driver.operatingCountry!==snapshot.country.code)add('country_mismatch','Driver selected a different operating country');if(point){if(!contains(countryBoundaries[snapshot.country.code],point))add('outside_country','GPS is outside the booking country');else{zone=zoneAt(snapshot,point,service);if(!zone)add('zone_unavailable','GPS is outside an enabled service zone');}}}
 const vehicles=policy?.eligibility?.vehicles||config?.vehicles||['economy','comfort','premium','xl'];if(!vehicles.includes(driver.vehicle?.type)||!driver.vehicle?.plate)add('vehicle_ineligible','Vehicle category or registration is unavailable');
 if((policy?.eligibility?.requireLicense||config?.requireLicense)&&(!driver.license?.verified||(driver.license.expiry&&new Date(driver.license.expiry)<=new Date())))add('license_unverified','License is unverified or expired');
 if(config?.documents?.some(type=>!driver.documents?.some(d=>d.type===type&&d.verified)))add('documents_missing','Required verified documents are missing');
 if(driver.currentRideId||driver.currentDeliveryId)add('assignment_conflict','Driver already has an active ride or delivery');
 const wallet=walletAccount(user,localCurrency);if(!wallet||wallet.balance<0)add('wallet_ineligible',localCurrency+' wallet is unavailable or has outstanding debt');
 const radiusKm=policy?.dispatch?.radiusKm||config?.dispatch.radiusKm||15,distanceKm=point&&pickup?haversineDistance(point.lat,point.lng,pickup.lat,pickup.lng):null;if(distanceKm!==null&&distanceKm>radiusKm)add('outside_radius','Driver is beyond the courier search radius');
 return {eligible:!reasons.length,reasons,country:snapshot?.country.code||null,zone:zone?{id:zone.id,name:zone.name}:null,point,lastLocationUpdate:driver.lastLocationUpdate||null,distanceKm,radiusKm,currency:localCurrency,walletBalance:wallet?.balance??null};
}

export function deliveryOperationsPolicy(settings,operations){
 const s=structuredClone(settings),config=operations.config;
 s.currency=operations.country.currency;s.general.regions=config.activeCities;
 s.general.enabled=s.general.enabled&&config.delivery;
 s.general.startHour=config.deliveryHours.start;s.general.endHour=config.deliveryHours.end;
 if(config.deliveryPricing)s.pricing=config.deliveryPricing;
 if(operations.revision>0||operations.country.code!=='EG')s.dispatch={...config.deliveryDispatch};
 s.eligibility.vehicles=s.eligibility.vehicles.filter(v=>config.vehicles.includes(v));
 s.eligibility.requireLicense=s.eligibility.requireLicense||config.requireLicense;
 if(operations.country.code!=='EG'){s.eligibility.vehicles=config.vehicles;s.eligibility.requireLicense=config.requireLicense;}
 return s;
}
