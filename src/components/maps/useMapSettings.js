"use client";
import { useEffect, useState } from "react";
import { mapDefaults } from "@/lib/map-config";
export function useMapSettings(enabled=true) {
  const [config, setConfig] = useState({
    settings: mapDefaults,
    center: null,
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
    const timer=setInterval(load,15000);
    window.addEventListener("storage",load);
    window.addEventListener("focus",load);
    window.addEventListener("maxride:maps-saved", load);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;clearInterval(timer);window.removeEventListener("storage",load);window.removeEventListener("focus",load);
      window.removeEventListener("maxride:maps-saved", load);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled]);
  return config;
}
