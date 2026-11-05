"use client";
import {t} from '@/lib/i18n';
import {useI18n} from '@/context/LanguageProvider';

import { useEffect, useRef, useState } from "react";
import {
  Map as MLMap,
  Marker,
  LngLatBounds,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useMapSettings } from "./useMapSettings";
import { basemapStyle, mapRequest, cartoConfigured } from "@/lib/map-config";
import { arabicMapStyle } from "@/lib/map-labels";

function el(className, html) {
  const div = document.createElement("div");
  div.className = className;
  if (html) div.innerHTML = html;
  return div;
}

function prototypeMarker(name){
 const allowed=['pickup_pin','dropoff_pin','economy_top','comfort_top','premium_top','xl_top'];
 const div=el('reference-map-marker'),img=document.createElement('img');
 img.src='/rider-assets/m/'+(allowed.includes(name)?name:'economy_top')+'.svg';img.alt='';img.style.cssText='display:block;width:36px;height:44px;object-fit:contain';div.appendChild(img);return div;
}

const CAR_SVG =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>';

const PIN_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>';

const SQUARE_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

export default function MapView({
  prototypeMarkers = false,
  vehicleType = 'economy',
  publicMap = false,
  center: requestedCenter,
  zoom: requestedZoom,
  autoFitDrivers = false,
  showDriverNames = false,
  pickup,
  dropoff,
  routeGeometry,
  zones: suppliedZones,
  onZoneClick,
  fitZones = false,
  drivers = [],
  driverPosition,
  userPosition,
  fit = false,
  fitBottom = 80,
  onClick,
  className = "",
  style,
}) {
  const config = useMapSettings(!publicMap);
  const center = requestedCenter || (publicMap ? dropoff || pickup || driverPosition : config.center);
  const zoom = requestedZoom ?? config.settings.initialZoom;
  const [mapState, setMapState] = useState("loading");
  const [routeReady, setRouteReady] = useState(false);
  const {language}=useI18n();
  const [mapError, setMapError] = useState("");
  const [fallback, setFallback] = useState(false);
  const [retry, setRetry] = useState(0);
  const driverAnimations = useRef(new Map());
  const selectedProvider = fallback
    ? "openfreemap"
    : config.settings.basemapProvider;
  const selectedStyle = fallback ? "standard" : config.settings.mapStyle;
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const markersRef = useRef({
    pickup: null,
    dropoff: null,
    driver: null,
    user: null,
  });
  const driverDotsRef = useRef(new Map());
  const animRef = useRef(null);
  // Latest route geometry — the style 'load' handler reads this so a route
  // that arrives before the style finishes loading still gets drawn.
  const routeGeomRef = useRef(null);
  const onClickRef = useRef(onClick);
  const zones = suppliedZones || config.zones;
  useEffect(() => {
    const map=mapRef.current;
    if(!map||!zones)return;
    let appliedSource;
    if(fitZones&&zones.length){const bounds=new LngLatBounds();for(const z of zones){const points=z.geometry.type==='Polygon'?z.geometry.coordinates.flat():z.geometry.coordinates.flat(2);for(const p of points)bounds.extend(p);}if(!bounds.isEmpty())map.fitBounds(bounds,{padding:35,maxZoom:13,duration:400});}
    const draw=()=>{
      if(!map.isStyleLoaded())return;
      if(appliedSource&&map.getSource('operating-zones')===appliedSource)return;
      const data={type:'FeatureCollection',features:zones.map(z=>({type:'Feature',id:z.id,properties:{id:z.id,name:language==='ar'&&z.nameAr?z.nameAr:t(z.name),active:!!z.active},geometry:z.geometry}))};
      if(map.getSource('operating-zones'))map.getSource('operating-zones').setData(data);
      else{
        map.addSource('operating-zones',{type:'geojson',data});
        map.addLayer({id:'operating-zones-fill',type:'fill',source:'operating-zones',paint:{'fill-color':['case',['get','active'],'#62616b','#a8a6a0'],'fill-opacity':0.12}});
        map.addLayer({id:'operating-zones-line',type:'line',source:'operating-zones',paint:{'line-color':['case',['get','active'],'#29282c','#99968d'],'line-width':2}});
      }
      appliedSource=map.getSource('operating-zones');
    };
    const select=e=>{if(onZoneClick&&map.getLayer('operating-zones-fill')){const f=map.queryRenderedFeatures(e.point,{layers:['operating-zones-fill']})[0];if(f)onZoneClick(f.properties.id);}};
    draw();map.on('idle',draw);map.on('click',select);
    return()=>{map.off('idle',draw);map.off('click',select);};
  },[zones,onZoneClick,mapState,fitZones,language]);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // ── Init once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !center) return undefined;

    // MapLibre 6 uses a separate module worker. Serve its matching shared module
    // from public assets rather than resolving relative to a Next.js chunk.
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map = new MLMap({
      container: containerRef.current,
      style: basemapStyle("openfreemap", "standard"),
      transformRequest: mapRequest,
      transformStyle: arabicMapStyle,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
    });

    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    const applyRoute = () => {
      readyRef.current = drawRoute(map, routeGeomRef.current);
      setRouteReady(readyRef.current);
    };

    // The style may finish loading before OR after this handler is attached,
    // and a style reload wipes custom sources — so react to both events and
    // let drawRoute() re-create anything missing (it is idempotent).
    map.on("load", applyRoute);
    map.on("idle", () => {
      // A first route may arrive during a camera move while tiles are pending.
      // Retry once ready; do not setData on every idle (that creates a loop).
      if (routeGeomRef.current?.length && !readyRef.current) applyRoute();
      if (map.areTilesLoaded())
        setMapState((current) => (current === "error" ? current : "ready"));
    });
    map.on("error", () => {
      setMapState("error");
      setMapError(
        "The basemap could not load. Check your connection or use OpenFreeMap Standard.",
      );
    });
    map.on("style.load", () => {
      readyRef.current = false;
      setRouteReady(false);
      applyRoute();
    });

    map.on("click", (e) => {
      onClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Guarantee correct canvas size even when the container lays out
    // after map construction (flex/absolute parents, modals, HMR).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    mapRef.current = map;

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animRef.current);
      // Markers belong to this map instance — drop them so a remount
      // (StrictMode/HMR) recreates them on the new map.
      markersRef.current = {
        pickup: null,
        dropoff: null,
        driver: null,
        user: null,
      };
      driverDotsRef.current.clear();
      driverAnimations.current.forEach((id) => cancelAnimationFrame(id));
      driverAnimations.current.clear();
      try {
        map.remove();
      } catch (err) {
        // remove() can throw when torn down mid-load; never let that block
        // the next mount from creating a fresh map.
        console.warn("[MapView] map.remove() failed:", err?.message);
      }
      if (mapRef.current === map) mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setMapState("loading");
    setMapError("");
    if (selectedProvider === "carto" && !cartoConfigured) {
      setMapError("CARTO has no configured key. OpenFreeMap is being used.");
    }
    map.setStyle(basemapStyle(selectedProvider, selectedStyle));
    const timer = setTimeout(() => {
      if (!map.areTilesLoaded()) {
        setMapState("error");
        setMapError("Map loading timed out. Retry OpenFreeMap Standard.");
      }
    }, 25000);
    return () => clearTimeout(timer);
  }, [selectedProvider, selectedStyle, retry]);

  // ── Pickup / dropoff / user markers ──
  function syncMarker(key, pos, make) {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    if (!pos) {
      markers[key]?.remove();
      markers[key] = null;
      return;
    }
    if (!markers[key]) {
      markers[key] = new Marker({ element: make() })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map);
    } else {
      markers[key].setLngLat([pos.lng, pos.lat]);
    }
  }

  useEffect(() => {
    syncMarker("pickup", pickup, () => prototypeMarkers ? prototypeMarker('pickup_pin') : el("marker-pin pickup", PIN_SVG));
  }, [pickup?.lat, pickup?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncMarker("dropoff", dropoff, () => prototypeMarkers ? prototypeMarker('dropoff_pin') : el("marker-pin dropoff", SQUARE_SVG));
  }, [dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncMarker("user", userPosition, () => {
      const dot = el("");
      dot.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.3)";
      return dot;
    });
  }, [userPosition?.lat, userPosition?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Assigned driver marker (smoothly animated) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;

    if (!driverPosition) {
      markers.driver?.remove();
      markers.driver = null;
      return;
    }

    const target = [driverPosition.lng, driverPosition.lat];

    if (!markers.driver) {
      markers.driver = new Marker({ element: prototypeMarkers ? prototypeMarker(vehicleType+'_top') : el("marker-driver", CAR_SVG) })
        .setLngLat(target)
        .addTo(map);
      return;
    }

    // Lerp from current to target over ~900ms for a fluid glide
    const from = markers.driver.getLngLat();
    const start = performance.now();
    const D = 900;
    cancelAnimationFrame(animRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - start) / D);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      markers.driver?.setLngLat([
        from.lng + (target[0] - from.lng) * e,
        from.lat + (target[1] - from.lat) * e,
      ]);
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, [driverPosition?.lat, driverPosition?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Authorized admin metadata is optional; rider nearby payloads stay anonymous.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dots = driverDotsRef.current;
    const seen = new Set();
    for (const d of drivers) {
      if (!d?.location) continue;
      seen.add(d.id);
      const target = [d.location.lng, d.location.lat];
      let marker = dots.get(d.id);
      if (!marker) {
        const element = prototypeMarkers ? prototypeMarker((d.vehicle?.type||d.vehicleType||'economy')+'_top') : el("marker-driver", CAR_SVG);
        element.setAttribute("role", "button");
        element.tabIndex = 0;
        marker = new Marker({ element }).setLngLat(target).addTo(map);
        dots.set(d.id, marker);
        element.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            marker.togglePopup();
          }
        });
      } else {
        cancelAnimationFrame(driverAnimations.current.get(d.id));
        const from = marker.getLngLat();
        const start = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - start) / 800);
          const eased = 1 - (1 - t) ** 3;
          marker.setLngLat([
            from.lng + (target[0] - from.lng) * eased,
            from.lat + (target[1] - from.lat) * eased,
          ]);
          if (t < 1)
            driverAnimations.current.set(d.id, requestAnimationFrame(step));
        };
        driverAnimations.current.set(d.id, requestAnimationFrame(step));
      }
      const element = marker.getElement();
      element.setAttribute(
        "aria-label",
        d.name ? "Driver " + d.name : "Nearby vehicle",
      );
      element.querySelector(".map-driver-name")?.remove();
      if (showDriverNames && d.name) {
        const label = el("map-driver-name");
        label.textContent = d.name;
        element.appendChild(label);
      }
      if (d.name) {
        const content = el("map-driver-popup");
        const title = document.createElement("strong");
        title.textContent = d.name;
        content.appendChild(title);
        for (const text of [
          [d.vehicle?.make, d.vehicle?.model, d.vehicle?.plate]
            .filter(Boolean)
            .join(" · ") ||
            d.vehicle?.type ||
            "Vehicle",
          d.status === "on_trip" ? "On a trip" : "Available",
        ]) {
          const row = document.createElement("div");
          row.textContent = text;
          content.appendChild(row);
        }
        const time = document.createElement("small");
        time.textContent =
          "Last GPS update: " + new Date(d.timestamp).toLocaleTimeString();
        content.appendChild(time);
        if (marker.getPopup()) marker.getPopup().setDOMContent(content);
        else marker.setPopup(new Popup({ offset: 22 }).setDOMContent(content));
      }
    }
    for (const [id, marker] of dots)
      if (!seen.has(id)) {
        cancelAnimationFrame(driverAnimations.current.get(id));
        driverAnimations.current.delete(id);
        marker.remove();
        dots.delete(id);
      }
    if (autoFitDrivers && drivers.length) {
      const points = drivers.map((d) => [d.location.lng, d.location.lat]);
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 700 });
    }
  }, [drivers, autoFitDrivers, showDriverNames]);

  // ── Route line ──
  useEffect(() => {
    routeGeomRef.current = routeGeometry || null;
    const map = mapRef.current;
    if (!map) return;
    // drawRoute self-guards on style readiness; if the style isn't up yet the
    // 'load'/'styledata' handlers will re-apply routeGeomRef.
    readyRef.current = drawRoute(map, routeGeometry);
    setRouteReady(readyRef.current);
  }, [routeGeometry]);

  // ── Fit bounds ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fit) return;

    const points = [];
    if (pickup) points.push([pickup.lng, pickup.lat]);
    if (dropoff) points.push([dropoff.lng, dropoff.lat]);
    if (driverPosition) points.push([driverPosition.lng, driverPosition.lat]);
    if (routeGeometry?.length) points.push(...routeGeometry);
    if (points.length < 2) {
      if (points.length === 1)
        map.easeTo({ center: points[0], zoom: 15, duration: 600 });
      return;
    }

    const bounds = points.reduce(
      (b, p) => b.extend(p),
      new LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, {
      padding: { top: 80, bottom: fitBottom, left: prototypeMarkers ? 40 : 60, right: prototypeMarkers ? 40 : 60 },
      duration: 700,
      maxZoom: 16,
    });
    // driverPosition is intentionally not a dep — refitting on every GPS
    // ping would make the camera jitter. It's included in bounds whenever
    // a route/endpoint change triggers a refit.
  }, [fit, fitBottom, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, routeGeometry]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recenter when no fit target ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fit || pickup || dropoff) return;
    if(!center)return;
    map.easeTo({ center: [center.lng, center.lat], zoom, duration: 600 });
  }, [center?.lat, center?.lng, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={"map-frame " + className}
      style={style}
      data-map-state={mapState}
      data-route-state={routeGeometry?.length ? (routeReady ? "drawn" : "pending") : "none"}
      data-map-provider={selectedProvider}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          opacity: mapState === "error" ? 0.25 : 1,
        }}
        aria-label={t('Map')}
      />
      {(mapState === "error" || mapError || config.error) && (
        <div className="map-notice" role="alert">
          {t(mapError || config.error)}
          <br />
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setFallback(true);
              setRetry((n) => n + 1);
            }}
          >
            {t('Use OpenFreeMap Standard')}
          </button>
        </div>
      )}
      {mapState === "loading" && !mapError && (
        <div className="map-notice" role="status">
          {t('Loading map…')}
        </div>
      )}
    </div>
  );
}

/**
 * Draw the route line, creating the source/layers if they don't exist yet.
 *
 * Idempotent and safe to call at any time: returns false (a no-op) while the
 * style isn't ready, so callers can simply try again on the next style event.
 */
function drawRoute(map, geometry) {
  if (!geometry?.length) {
    try { map.getSource("route")?.setData({type:"FeatureCollection",features:[]}); } catch {}
    return false;
  }
  const data = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: geometry || [] },
  };

  try {
    // Fast path: once the source exists, updating it never needs the style to
    // be "loaded" — isStyleLoaded() stays false while tiles stream in, so
    // gating on it here would drop routes indefinitely.
    const existing = map.getSource("route");
    if (existing) {
      existing.setData(data);
      return true;
    }
  } catch {
    // getSource throws before the style exists — fall through and wait
  }

  // Creating the source/layers does require a ready style
  let styleReady = false;
  try {
    styleReady = map.isStyleLoaded();
  } catch {
    styleReady = false;
  }
  if (!styleReady) return false;

  try {
    map.addSource("route", { type: "geojson", data });
    if (!map.getLayer("route-casing")) {
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#ffffff",
          "line-width": 7,
          "line-opacity": 0.9,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }
    if (!map.getLayer("route-line")) {
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": "#1c1917", "line-width": 4 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }

    return true;
  } catch (err) {
    console.warn("[MapView] route draw failed:", err?.message);
    return false;
  }
}
