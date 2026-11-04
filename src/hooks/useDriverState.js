'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/context/SocketProvider';
import {useNotifications} from '@/context/NotificationProvider';
import {unlockAudio,playAlert,stopAlert} from '@/lib/notification-audio';
import {closeOfferNotification} from '@/lib/browser-notification-permission';

const PING_INTERVAL_MS = 3500;

/**
 * Owns the driver's live state: profile, online status, GPS streaming,
 * incoming offers, and the active trip.
 */
export default function useDriverState({ onEvent } = {}) {
  const { socket, isConnected } = useSocket();
  const notifications=useNotifications();
  const [profile, setProfile] = useState(null); // Driver doc
  const [online, setOnline] = useState(false);
  const [offer, setOffer] = useState(null); // incoming ride offer
  const [ride, setRide] = useState(null); // active serialized ride
  const [position, setPosition] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const watchIdRef = useRef(null);
  const lastPingRef = useRef(0);
  const rideRef = useRef(null);
  const socketRef = useRef(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    rideRef.current = ride;
    socketRef.current = socket;
    onEventRef.current = onEvent;
  });

  const notify = useCallback((type, data) => onEventRef.current?.(type, data), []);
  useEffect(()=>{
    if(!offer)return;
    const expiresAt=offer.expiresAt||new Date(offer.receivedAt+(offer.expiresInSeconds||16)*1000).toISOString();
    const remaining=Date.parse(expiresAt)-Date.now();if(remaining<=0){setOffer(null);return;}
    if(notifications?.preferences.driverSound&&!notifications?.preferences.muted&&notifications?.policy.driverSound!==false)playAlert({key:'offer:'+offer.offerId,offer:true,expiresAt});
    const timer=setTimeout(()=>{stopAlert();closeOfferNotification(offer.rideId);setOffer(null);},remaining);
    return()=>{clearTimeout(timer);stopAlert();};
  },[offer,notifications?.preferences.driverSound,notifications?.preferences.muted,notifications?.policy.driverSound]);
  useEffect(()=>{
    if(!socket)return;
    let live=true;
    const sync=async()=>{try{const [a,o]=await Promise.all([fetch('/api/rides/active'),fetch('/api/drivers/me/offer')]);if(!live)return;if(a.ok){const d=await a.json();setRide(d.ride||null);}if(o.ok){const d=await o.json();setOffer(d.offer?{...d.offer,receivedAt:Date.now()}:null);}}catch{}};
    socket.on('connect',sync);if(isConnected)sync();return()=>{live=false;socket.off('connect',sync);};
  },[socket,isConnected]);

  // ── Initial load: profile + active ride ──
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [profileRes, activeRes] = await Promise.all([
          fetch('/api/drivers/me'),
          fetch('/api/rides/active'),
        ]);
        if (profileRes.ok) {
          const { driver } = await profileRes.json();
          if (!ignore) {
            setProfile(driver);
            setOnline(Boolean(driver.isOnline));
          }
        }
        if (activeRes.ok) {
          const { ride: active } = await activeRes.json();
          if (!ignore && active) setRide(active);
        }
      } catch { /* offline — retry on action */ }
      finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  // ── GPS watch + socket ping while online (or on a trip) ──
  useEffect(() => {
    const shouldTrack = online || Boolean(ride);
    if (!shouldTrack || !navigator.geolocation) return undefined;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        };
        setPosition(point);

        const now = Date.now();
        if (now - lastPingRef.current >= PING_INTERVAL_MS) {
          lastPingRef.current = now;
          socketRef.current?.emit('driver:location', {
            ...point,
            rideId: rideRef.current?.id,
          });
        }
      },
      () => { /* watch errors are non-fatal; next fix retries */ },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [online, Boolean(ride)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket events ──
  useEffect(() => {
    if (!socket) return undefined;

    const subscribe = () => {
      const current = rideRef.current;
      if (current?.id) socket.emit('ride:subscribe', { rideId: current.id });
    };
    socket.on('connect', subscribe);
    if (isConnected) subscribe();

    const handlers = {
      'ride:accepted':data=>{stopAlert();closeOfferNotification(data.ride?.id);setOffer(null);setRide(data.ride);},
      'ride:driver-arrived':data=>setRide(r=>r?.id===data.rideId?{...r,status:'arrived'}:r),
      'ride:started':data=>setRide(r=>r?.id===data.rideId?{...r,status:'in_progress'}:r),
      'ride:completed':data=>setRide(r=>r?.id===data.rideId?null:r),
      'ride:offer': (data) => {
        // Ignore offers while already on a trip (stale cascade edge)
        if (rideRef.current) return;
        setOffer(old=>old?.offerId===data.offerId?old:{ ...data, receivedAt: Date.now() });
        notify('offer', data);
      },
      'ride:offer-expired': (data) => {
        closeOfferNotification(data.rideId);
        setOffer((o) => (o && o.rideId === data.rideId ? null : o));
        notify('offer-expired', data);
      },
      'ride:offer-withdrawn': (data) => {
        closeOfferNotification(data.rideId);
        setOffer((o) => (o && o.rideId === data.rideId ? null : o));
        notify('offer-withdrawn', data);
      },
      'ride:cancelled': (data) => {
        setOffer(o=>o?.rideId===data.rideId?null:o);stopAlert();
        if (rideRef.current?.id === data.rideId) {
          setRide(null);
          notify('rider-cancelled', data);
        }
      },
      'ride:message': (data) => {
        setRide((r) => {
          if (!r || r.id !== data.rideId) return r;
          if((r.messages||[]).some(m=>String(m._id||m.id)===data.id))return r;
          return { ...r, messages: [...(r.messages || []), {id:data.id, from: data.from, text: data.text, at: data.at }] };
        });
        if(data.from!=='driver')notify('message', data);
      },
    };

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    return () => {
      socket.off('connect', subscribe);
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
    };
  }, [socket, isConnected, notify]);

  // ── Actions ──
  const getFix = () =>
    new Promise((resolve, reject) => {
      // Browsers only allow geolocation on https:// or localhost. Opening the
      // app via an IP like 0.0.0.0 silently blocks it with no prompt.
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        return reject(
          new Error(
            `Location is blocked on ${window.location.hostname} — open the app at http://localhost:${window.location.port || 3000} (or via https) to go online`
          )
        );
      }
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) =>
          reject(
            new Error(
              err.code === 1
                ? 'Location permission denied — allow location for this site in your browser settings, then try again'
                : 'Could not get your location — try again'
            )
          ),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });

  const goOnline = useCallback(async () => {
    await unlockAudio();
    setBusy(true);
    try {
      const location = await getFix();
      const res = await fetch('/api/drivers/me/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: true, location }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || 'Failed to go online');
        err.code = data.code;
        throw err;
      }
      setPosition(location);
      setOnline(true);
      // Announce immediately so the H3 index has a fresh ping
      socketRef.current?.emit('driver:location', { ...location });
    } finally {
      setBusy(false);
    }
  }, []);

  const goOffline = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/drivers/me/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to go offline');
      socketRef.current?.emit('driver:offline');
      setOnline(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const act = useCallback(async (rideId, action, body) => {
    const res = await fetch(`/api/rides/${rideId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Failed to ${action}`);
    return data;
  }, []);

  const accept = useCallback(async () => {
    if (!offer) return;
    stopAlert();
    closeOfferNotification(offer.rideId);
    const data = await act(offer.rideId, 'accept');
    setOffer(null);
    setRide(data.ride);
    socketRef.current?.emit('ride:subscribe', { rideId: data.ride.id });
  }, [offer, act]);

  const decline = useCallback(async () => {
    if (!offer) return;
    stopAlert();
    closeOfferNotification(offer.rideId);
    const { rideId } = offer;
    setOffer(null);
    try {
      await act(rideId, 'decline');
    } catch { /* timeout already advanced the cascade */ }
  }, [offer, act]);

  const arrive = useCallback(async () => {
    const data = await act(rideRef.current.id, 'arrive');
    setRide((r) => ({ ...r, status: data.ride.status }));
  }, [act]);

  const start = useCallback(async (pin) => {
    const data = await act(rideRef.current.id, 'start', { pin });
    setRide((r) => ({ ...r, status: data.ride.status }));
  }, [act]);

  const complete = useCallback(async () => {
    const data = await act(rideRef.current.id, 'complete');
    setRide(null);
    return data.ride;
  }, [act]);

  const cancelTrip = useCallback(async (reason) => {
    await act(rideRef.current.id, 'cancel', { reason });
    setRide(null);
  }, [act]);

  return {
    loading,
    profile,
    setProfile,
    online,
    position,
    offer,
    ride,
    busy,
    isConnected,
    goOnline,
    goOffline,
    accept,
    decline,
    arrive,
    start,
    complete,
    cancelTrip,
  };
}
