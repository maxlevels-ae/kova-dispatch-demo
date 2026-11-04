'use client';
import {t as tr} from '@/lib/i18n';
import {useI18n} from '@/context/LanguageProvider';
import {Car} from 'lucide-react';
import {Avatar,Stars,VEHICLE_LABELS,RideStatusBadge} from '@/components/ui/bits';
export default function AssignedVehicleCard({ride,etaMinutes}){
  useI18n();
 const driver=ride?.driver;if(!driver)return null;const v=driver.vehicle||{};
 return <section className="assigned-vehicle" aria-label={tr("Assigned vehicle")}>
  <div className="assigned-vehicle-photo">{v.imageUrl?<img src={v.imageUrl} alt={`${v.make||''} ${v.model||''}`.trim()||'Assigned vehicle'}/>:<Car size={46} strokeWidth={1.4} aria-label={tr("No vehicle photo uploaded")}/>}</div>
  <div className="assigned-vehicle-details"><strong>{tr([v.make,v.model].filter(Boolean).join(' ')||'Assigned vehicle')}</strong><span className="small muted">{tr(v.color||'Color not recorded')} · {tr(VEHICLE_LABELS[v.type]||v.type||ride.vehicleType)}</span><span className="badge badge-neutral mono-nums">{tr(v.plate||'Plate not recorded')}</span></div>
  <div className="assigned-vehicle-driver"><Avatar name={driver.name} src={driver.avatar}/><div><strong>{driver.name}</strong><Stars value={driver.rating}/></div><RideStatusBadge status={ride.status}/></div>
  {ride.status==='accepted'&&<p className="small muted">{tr(Number.isFinite(etaMinutes)?`Estimated arrival: ${etaMinutes} min`:'Arrival estimate pending live GPS')}</p>}
 </section>;
}
