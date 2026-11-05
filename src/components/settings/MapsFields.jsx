"use client";
import {
  mapStyles,
  cartoConfigured,
} from "@/lib/map-config";
import {
  SettingsSection,
  SettingsSelect,
  SettingsToggle,
  SettingsStatus,
} from "./SettingsUI";
export default function MapsFields({ value, onChange, busy }) {
  const choose = (key) => (e) => onChange(key, e.target.value);
  return (
    <>
      <SettingsSection
        title="Map provider"
        description="OpenFreeMap works without an API key. CARTO is available only when its browser key is configured."
      >
        <div className="settings-fields">
          <SettingsSelect
            label="Basemap provider"
            value={value.basemapProvider}
            disabled={busy}
            onChange={choose("basemapProvider")}
            options={[
              { value: "openfreemap", label: "OpenFreeMap · No key required" },
              {
                value: "carto",
                label: cartoConfigured
                  ? "CARTO · Key configured"
                  : "CARTO · API key required",
                disabled: !cartoConfigured,
              },
            ]}
          />
          <SettingsSelect
            label="Map style"
            value={value.mapStyle}
            disabled={busy}
            onChange={choose("mapStyle")}
            options={mapStyles}
          />
        </div>
        <p className="settings-hint">
          <SettingsStatus>
            {value.basemapProvider === "carto"
              ? cartoConfigured
                ? "CARTO key configured · Connection checked on load"
                : "CARTO unavailable"
              : "OpenFreeMap available · No API key required"}
          </SettingsStatus>
        </p>
      </SettingsSection>
      <SettingsSection
        title="Default map behavior"
        description="Driver filters and marker options apply to the admin live map. GPS positions are hidden after 90 seconds without an update."
      >
        <div className="settings-fields">
          <SettingsSelect
            label="Initial zoom"
            value={value.initialZoom}
            disabled={busy}
            onChange={(e) => onChange("initialZoom", Number(e.target.value))}
            options={[8, 10, 12, 14, 16].map((z) => ({
              value: z,
              label: `Zoom ${z}`,
            }))}
          />
          <SettingsSelect
            label="Driver status filter"
            value={value.driverStatusFilter}
            disabled={busy}
            onChange={choose("driverStatusFilter")}
            options={[
              { value: "all", label: "All online drivers" },
              { value: "available", label: "Available" },
              { value: "on_trip", label: "On a trip" },
            ]}
          />
          <SettingsSelect
            label="Vehicle category filter"
            value={value.vehicleCategoryFilter}
            disabled={busy}
            onChange={choose("vehicleCategoryFilter")}
            options={["all", "economy", "comfort", "premium", "xl"].map(
              (v) => ({
                value: v,
                label:
                  v === "all"
                    ? "All vehicle categories"
                    : v[0].toUpperCase() + v.slice(1),
              }),
            )}
          />
          <SettingsSelect
            label="Location refresh interval"
            value={value.locationRefreshSeconds}
            disabled={busy}
            onChange={(e) =>
              onChange("locationRefreshSeconds", Number(e.target.value))
            }
            options={[5, 15, 30, 60].map((v) => ({
              value: v,
              label: `${v} seconds`,
            }))}
          />
          <SettingsToggle
            label="Auto-fit online drivers"
            checked={value.autoFitDrivers}
            disabled={busy}
            onChange={(v) => onChange("autoFitDrivers", v)}
          />
          <SettingsToggle
            label="Show vehicle markers"
            checked={value.showVehicleMarkers}
            disabled={busy}
            onChange={(v) => onChange("showVehicleMarkers", v)}
          />
          <SettingsToggle
            label="Show driver names"
            checked={value.showDriverNames}
            disabled={busy}
            onChange={(v) => onChange("showDriverNames", v)}
          />
        </div>
      </SettingsSection>
      <SettingsSection
        title="Routing"
        description="Road routing and distance-estimate fallback remain independent from the basemap."
      >
        <SettingsSelect
          label="Routing provider"
          value={value.routingMode}
          disabled={busy}
          onChange={choose("routingMode")}
          options={[
            { value: "osrm", label: "OSRM road routing" },
            { value: "estimate", label: "Distance estimate" },
          ]}
        />
      </SettingsSection>
      <p className="settings-hint">Operating countries and service boundaries are managed in <a href="/admin/settings/operating-areas">Countries &amp; Service Zones</a>.</p>
    </>
  );
}
