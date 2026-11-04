'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/context/SocketProvider';
import {unlockAudio} from '@/lib/notification-audio';

/**
 * Owns the rider's live ride state:
 *  - resumes an active ride from the server on mount / reconnect
 *  - listens to all ride socket events
 *  - exposes book/cancel/rate actions
 *
 * phase: 'idle' | 'searching' | 'active' | 'done'
 */
export default function useRiderRide({ onEvent } = {}) {
  const { socket, isConnected } = useSocket();
  const [ride, setRide] = useState(null); // serialized ride
  const [driverPosition, setDriverPosition] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [offersSent, setOffersSent] = useState(0);
  const [completedRide, setCompletedRide] = useState(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const rideRef = useRef(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    rideRef.current = ride;
    onEventRef.current = onEvent;
  });

  const notify = useCallback((type, data) => {
    onEventRef.current?.(type, data);
  }, []);
  useEffect(()=>{
    if(ride?.status!=='accepted')return;
    let live=true;const update=async()=>{try{const r=await fetch(`/api/rides/${ride.id}/eta`);if(r.ok){const d=await r.json();if(live)setEtaMinutes(d.minutes);}}catch{}};
    update();const timer=setInterval(update,20000);return()=>{live=false;clearInterval(timer);};
  },[ride?.id,ride?.status]);
  useEffect(()=>{
    if(!socket)return;
    let live=true;
    const sync=async()=>{try{
      const current=rideRef.current;const res=await fetch(current?.id?'/api/rides/'+current.id:'/api/rides/active');if(!res.ok||!live)return;const {ride:active}=await res.json();
      if(active?.status==='completed'){setCompletedRide(active);setRide(null);setDriverPosition(null);}
      else if(active&&['cancelled','no_drivers'].includes(active.status)){setRide(null);setDriverPosition(null);}
      else {setRide(active||null);setDriverPosition(active?.driver?.location||null);}
    }catch{}};
    const visible=()=>{if(!document.hidden)sync();};socket.on('connect',sync);socket.on('notification:new',sync);document.addEventListener('visibilitychange',visible);const timer=setInterval(visible,10000);if(isConnected)sync();return()=>{live=false;clearInterval(timer);socket.off('connect',sync);socket.off('notification:new',sync);document.removeEventListener('visibilitychange',visible);};
  },[socket,isConnected]);

  // ── Resume active ride from the server ──
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch('/api/rides/active');
        if (res.ok) {
          const { ride: active } = await res.json();
          if (!ignore && active) {
            setRide(active);
            if (active.driver?.location) setDriverPosition(active.driver.location);
          }
        }
      } catch {
        /* server hiccup — booking still possible */
      } finally {
        if (!ignore) setLoadingActive(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // A page refresh can connect the socket before the active-ride request returns.
  // Subscribe when that ride arrives as well as when the transport reconnects.
  useEffect(() => {
    if (socket && isConnected && ride?.id) socket.emit('ride:subscribe', { rideId: ride.id });
  }, [socket, isConnected, ride?.id]);

  // ── Socket wiring ──
  useEffect(() => {
    if (!socket) return undefined;

    const subscribe = () => {
      const current = rideRef.current;
      if (current?.id) socket.emit('ride:subscribe', { rideId: current.id });
    };

    // (Re)subscribe on connect — covers reconnects mid-ride
    socket.on('connect', subscribe);
    if (isConnected) subscribe();

    const handlers = {
      'ride:searching-update': (data) => {
        setOffersSent(data.offersSent || 0);
      },
      'ride:accepted': (data) => {
        setRide(data.ride);
        setEtaMinutes(data.etaMinutes ?? null);
        if (data.ride?.driver?.location) setDriverPosition(data.ride.driver.location);
        socket.emit('ride:subscribe', { rideId: data.ride.id });
        notify('accepted', data);
      },
      'ride:no-drivers': (data) => {
        setRide(null);
        setOffersSent(0);
        notify('no-drivers', data);
      },
      'ride:driver-arrived': () => {
        setRide((r) => (r ? { ...r, status: 'arrived' } : r));
        notify('arrived');
      },
      'ride:started': () => {
        setRide((r) => (r ? { ...r, status: 'in_progress' } : r));
        notify('started');
      },
      'ride:completed': (data) => {
        setRide((r) => {
          if (r) {
            setCompletedRide({
              ...r,
              status: 'completed',
              fare: data.fare,
              payment: data.payment,
              shortfall: Boolean(data.shortfall),
            });
          }
          return null;
        });
        setDriverPosition(null);
        setEtaMinutes(null);
        notify('completed', data);
      },
      'ride:driver-cancelled': (data) => {
        // Ride went back to searching with a new dispatch
        setRide((r) => (r ? { ...r, status: 'searching', driver: undefined } : r));
        setDriverPosition(null);
        notify('driver-cancelled', data);
      },
      'driver:location': (data) => {
        if (data?.location) setDriverPosition(data.location);
      },
      'ride:message': (data) => {
        setRide((r) => {
          if (!r || r.id !== data.rideId) return r;
          if((r.messages||[]).some(m=>String(m._id||m.id)===data.id))return r;
          return { ...r, messages: [...(r.messages || []), {id:data.id, from: data.from, text: data.text, at: data.at }] };
        });
        if(data.from!=='rider')notify('message', data);
      },
    };

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);

    return () => {
      socket.off('connect', subscribe);
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
    };
  }, [socket, isConnected, notify]);

  // ── Actions ──
  const book = useCallback(async ({ pickup, dropoff, vehicleType, scheduledAt }) => {
    await unlockAudio();
    const res = await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup, dropoff, vehicleType, scheduledAt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to book ride');
    setOffersSent(0);
    setRide(data.ride);
    return data.ride;
  }, []);

  const cancel = useCallback(async (reason) => {
    const current = rideRef.current;
    if (!current) return;
    const res = await fetch(`/api/rides/${current.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel');
    setRide(null);
    setDriverPosition(null);
    return data.ride;
  }, []);

  const rate = useCallback(async (rideId, rating, comment) => {
    const res = await fetch(`/api/rides/${rideId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to submit rating');
    }
  }, []);

  const phase = ride
    ? ride.status === 'searching'
      ? 'searching'
      : 'active'
    : completedRide
      ? 'done'
      : 'idle';

  return {
    phase,
    ride,
    driverPosition,
    etaMinutes,
    offersSent,
    completedRide,
    clearCompleted: () => setCompletedRide(null),
    loadingActive,
    isConnected,
    book,
    cancel,
    rate,
  };
}
