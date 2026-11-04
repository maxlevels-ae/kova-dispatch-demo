'use client';
import {t as tr} from '@/lib/i18n';
import {useI18n} from '@/context/LanguageProvider';
import AssignedVehicleCard from '@/components/ride/AssignedVehicleCard';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Circle, MapPin } from 'lucide-react';
import MapView from '@/components/maps/MapView';
import { RideStatusBadge, Avatar, Stars, Loading, VEHICLE_LABELS, money } from '@/components/ui/bits';
import { formatDate, formatDistance, formatDuration } from '@/lib/utils/geo';

export default function RideDetailPage() {
  useI18n();
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`/api/rides/${id}`);
        if (!res.ok) { if (!ignore) setNotFound(true); return; }
        const payload = await res.json();
        if (!ignore) setData(payload);
      } catch {
        if (!ignore) setNotFound(true);
      }
    })();
    return () => { ignore = true; };
  }, [id]);

  if (notFound) {
    return (
      <div className="content-pad">
        <p className="muted">{tr("Ride not found.")}</p>
      </div>
    );
  }

  if (!data) return <div className="content-pad"><Loading /></div>;

  const { ride } = data;

  return (
    <div className="content-pad" style={{ maxWidth: 760 }}>
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => router.back()}>
        <ArrowLeft size={16} />{tr("Back")}</button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">{tr(VEHICLE_LABELS[ride.vehicleType])}</h1>
          <p className="page-sub">{tr(formatDate(ride.createdAt))}</p>
        </div>
        <RideStatusBadge status={ride.status} />
      </div>

      <div className="card" style={{ height: 260, overflow: 'hidden', position: 'relative' }}>
        <MapView
          center={{ lat: ride.pickup.lat, lng: ride.pickup.lng }}
          pickup={{ lat: ride.pickup.lat, lng: ride.pickup.lng }}
          dropoff={{ lat: ride.dropoff.lat, lng: ride.dropoff.lng }}
          routeGeometry={ride.route?.geometry}
          fit
        />
      </div>

      <div className="card card-pad mt-4">
        <div className="flex-col gap-2 small">
          <div className="flex gap-2">
            <Circle size={14} style={{ marginTop: 3, color: 'var(--ink-950)', flexShrink: 0 }} />
            <span>{ride.pickup.address}</span>
          </div>
          <div className="flex gap-2">
            <MapPin size={14} style={{ marginTop: 3, color: 'var(--gold-600)', flexShrink: 0 }} />
            <span>{ride.dropoff.address}</span>
          </div>
        </div>
        <div className="flex gap-4 mt-3 tiny muted">
          <span>{tr(formatDistance(ride.route?.distanceMeters || 0))}</span>
          <span>{tr(formatDuration(ride.route?.durationSeconds || 0))}</span>
        </div>
      </div>

      <AssignedVehicleCard ride={ride}/>

      {(ride.status === 'completed' || ride.fare?.cancellationFee > 0) && (
        <div className="card card-pad mt-4">
          <h3 className="small mb-3" style={{ fontWeight: 700 }}>{tr("Receipt")}</h3>
          <div className="flex-col gap-1 small">
            {ride.status === 'completed' ? (
              <>
                <Row label={tr("Base fare")} value={money(ride.fare.baseFare, ride.fare?.currency ?? null)} />
                <Row label={tr("Distance")} value={money(ride.fare.distanceFare, ride.fare?.currency ?? null)} />
                <Row label={tr("Time")} value={money(ride.fare.timeFare, ride.fare?.currency ?? null)} />
                {ride.fare.surgeFare > 0 && <Row label={`Surge ${ride.fare.surgeMultiplier}×`} value={money(ride.fare.surgeFare, ride.fare?.currency ?? null)} />}
                <Row label={tr("Booking fee")} value={money(ride.fare.bookingFee, ride.fare?.currency ?? null)} />
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                  <Row label={<b>{tr("Total (")}{' '}{tr(ride.payment?.method)})</b>} value={<b>{tr(money(ride.fare.total, ride.fare?.currency ?? null))}</b>} />
                </div>
              </>
            ) : (
              <Row label={tr("Cancellation fee")} value={money(ride.fare.cancellationFee, ride.fare?.currency ?? null)} />
            )}
          </div>
        </div>
      )}

      {ride.rating?.byRider && (
        <div className="card card-pad mt-4">
          <h3 className="small mb-2" style={{ fontWeight: 700 }}>{tr("Your rating")}</h3>
          <Stars value={ride.rating.byRider} />
          {ride.rating.riderComment && <p className="small muted mt-2">“{tr(ride.rating.riderComment)}”</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  useI18n();
  return (
    <div className="flex items-center justify-between">
      <span className="muted">{tr(label)}</span>
      <span className="mono-nums">{tr(value)}</span>
    </div>
  );
}
