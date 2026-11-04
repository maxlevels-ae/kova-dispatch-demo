"use client";
import { useEffect, useState } from "react";
import { mapDefaults, cityCenter } from "@/lib/map-config";
export function useMapSettings(enabled=true) {
  const [config, setConfig] = useState({
    settings: mapDefaults,
    center: cityCenter(),
    providers: [],
    error: "",
  });
  useEffect(() => {
    if(!enabled)return;
    let active = true;
    async function load() {
      try {
        const r = await fetch("/api/maps/config", { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (active) setConfig({ ...d, error: "" });
      } catch (e) {
        if (active) setConfig((c) => ({ ...c, error: e.message }));
      }
    }
    load();
    const visible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("maxride:maps-saved", load);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.removeEventListener("maxride:maps-saved", load);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled]);
  return config;
}
