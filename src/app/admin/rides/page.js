'use client';

import { useEffect, useState } from 'react';
import { Route } from 'lucide-react';
import Link from 'next/link';
import { RideStatusBadge, Loading, Empty, VEHICLE_LABELS, money } from '@/components/ui/bits';
import { formatDate } from '@/lib/utils/geo';

const STATUSES = ['', 'searching', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_drivers'];

export default function AdminRidesPage() {
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [dispatchBusy, setDispatchBusy] = useState(false);
  async function dispatchRide(rideId) { setDispatchBusy(true); try { const r = await fetch('/api/admin/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rideId }) }); const d = await r.json(); if (!r.ok) throw Error(d.error); setDispatchMessage('Dispatch requested. Refresh the ride list to see progress.'); } catch (e) { setDispatchMessage(e.message); } finally { setDispatchBusy(false); } }
  const [rides, setRides] = useState(null);
  const [status, setStatus] = useState('');
  const [country,setCountry]=useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    let ignore = false;
    setRides(null);
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (status) params.set('status', status);
        if(country)params.set('country',country);
        const res = await fetch(`/api/admin/rides?${params}`);
        const data = await res.json();
        if (!ignore && res.ok) {
          setRides(data.rides);
          setPagination(data.pagination);
        }
      } catch {
        if (!ignore) setRides([]);
      }
    })();
    return () => { ignore = true; };
  }, [status, page,country]);

  return (
    <div className="content-pad">
      <h1 className="page-title">Rides</h1><p role="status">{dispatchMessage}</p>
      <p className="page-sub mb-6">Every trip on the platform</p>

      <div className="flex gap-2 wrap mb-4">
        <select className="input" aria-label="Country" value={country} onChange={e=>{setCountry(e.target.value);setPage(1);}}><option value="">All countries (including legacy)</option><option value="EG">Egypt</option><option value="JO">Jordan</option><option value="IQ">Iraq</option></select>
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setStatus(s); setPage(1); }}
          >
            {s === '' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {rides === null && <Loading label="Loading rides…" />}
      {rides?.length === 0 && <Empty icon={Route} title="No rides found" hint="Try a different filter." />}

      {rides?.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Rider</th>
                <th>Driver</th>
                <th>Route</th>
                <th>Tier</th>
                <th>Fare</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r._id}>
                  <td className="tiny muted" style={{ whiteSpace: 'nowrap' }}><Link href={'/admin/rides/'+r._id}>{formatDate(r.createdAt)}<br/>View trip details</Link></td>
                  <td className="small">{r.riderId?.name || '—'}</td>
                  <td className="small">{r.driverId?.name || <span className="muted">—</span>}</td>
                  <td className="small" style={{ maxWidth: 260 }}>
                    <div className="truncate">{r.pickup?.address}</div>
                    <div className="truncate muted tiny">→ {r.dropoff?.address}</div>
                  </td>
                  <td className="tiny">{VEHICLE_LABELS[r.vehicleType] || r.vehicleType}</td>
                  <td className="small mono-nums" style={{ fontWeight: 600 }}>
                    {r.status === 'completed' ? money(r.fare?.total, r.fare?.currency ?? null) : '—'}
                  </td>
                  <td><RideStatusBadge status={r.status} />{r.status === 'searching' && <button className="btn btn-secondary btn-sm" disabled={dispatchBusy} onClick={() => dispatchRide(r._id)}>Dispatch now</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="small muted" style={{ alignSelf: 'center' }}>{page} / {pagination.pages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
