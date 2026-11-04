"use client";
import {
  egyptLocations,
  cityCenter,
  mapStyles,
  cartoConfigured,
} from "@/lib/map-config";
import {
  SettingsSection,
  SettingsSelect,
  SettingsToggle,
  SettingsStatus,
  SettingsField,
} from "./SettingsUI";
export default function MapsFields({ value, onChange, busy, errors }) {
  const choose = (key) => (e) => onChange(key, e.target.value);
  const center = cityCenter(value);
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
        title="Operating location"
        description="Controlled Egypt catalogue: all 27 governorates, with their capital cities and selected additional cities."
      >
        <div className="settings-fields">
          <SettingsSelect
            label="Country"
            value={value.country}
            disabled={busy}
            onChange={choose("country")}
            options={["Egypt"]}
          />
          <SettingsSelect
            label="Governorate"
            value={value.governorate}
            disabled={busy}
            onChange={(e) =>
              onChange({
                governorate: e.target.value,
                city: Object.keys(egyptLocations[e.target.value])[0],
              })
            }
            options={Object.keys(egyptLocations)}
          />
          <SettingsSelect
            label="City"
            value={value.city}
            error={errors.city}
            disabled={busy}
            onChange={choose("city")}
            options={Object.keys(egyptLocations[value.governorate] || {})}
          />
        </div>
        <p className="settings-hint">
          Default map center: {center.lat.toFixed(4)}, {center.lng.toFixed(4)} ·
          Derived from selected city.
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
      <SettingsSection
        title="Service zones"
        description="Apply the saved rectangular service boundary to new booking requests."
      >
        <SettingsToggle
          label="Restrict pickups to boundary"
          checked={value.restrictPickup}
          disabled={busy}
          onChange={(v) => onChange("restrictPickup", v)}
        />
        <SettingsToggle
          label="Restrict dropoffs to boundary"
          checked={value.restrictDropoff}
          disabled={busy}
          onChange={(v) => onChange("restrictDropoff", v)}
        />
      </SettingsSection>
      <SettingsSection
        title="Advanced service boundary coordinates"
        description="Latitude ranges from −90 to 90; longitude from −180 to 180. These bounds do not change the city center."
      >
        <div className="settings-fields">
          {[
            ["south", "Southern latitude"],
            ["north", "Northern latitude"],
            ["west", "Western longitude"],
            ["east", "Eastern longitude"],
          ].map(([key, label]) => (
            <SettingsField
              key={key}
              label={label}
              type="number"
              step="any"
              disabled={busy}
              value={value[key]}
              error={errors[key]}
              onChange={(e) =>
                onChange(
                  key,
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
          ))}
        </div>
      </SettingsSection>
    </>
  );
}
