"use client";
import { useEffect, useState } from "react";
import { categories, events } from "@/lib/settings-schema";
import ProviderSettings from "@/components/ProviderSettings";
import BrandingSettings from "@/components/BrandingSettings";
import PricingSettings from "@/app/admin/pricing/page";
const tabs = [
  "General & Branding",
  "Bookings & Dispatch",
  "Drivers & Fleet",
  "Payment Gateways",
  "Notifications",
  "Pricing & Commission",
  "Maps & Service Zones",
  "Users & Security",
  "Integrations",
  "System & Monitoring",
];
const sections = {
  1: "dispatch",
  2: "fleet",
  4: "notifications",
  6: "maps",
  7: "security",
};
const labels = {
  maxDailyTrips: "Maximum trips in 24 hours (0 = unlimited)",
  suspensionReasonRequired: "Require a suspension reason",
  assignmentMode: "Assignment mode",
  fallback: "Dispatch fallback",
  scheduledEnabled: "Allow scheduled bookings",
  maxScheduleDays: "Maximum days in advance",
  searchRadiusKm: "Driver search radius (km)",
  acceptanceSeconds: "Acceptance timeout (seconds)",
  maxAttempts: "Maximum assignment attempts",
  maxTripKm: "Maximum trip distance (km)",
  serviceStartHour: "Service start hour (Africa/Cairo)",
  serviceEndHour: "Service end hour (Africa/Cairo)",
  enabledCategories: "Enabled vehicle categories",
  requiredDocuments: "Required verified documents",
  maxDebtEGP: "Maximum driver debt (EGP)",
  sessionHours: "Session duration for new logins (hours)",
  enabledEvents: "Enabled notification events",
  restrictPickup: "Restrict pickups to boundary",
  restrictDropoff: "Restrict dropoffs to boundary",
  south: "Southern latitude",
  north: "Northern latitude",
  west: "Western longitude",
  east: "Eastern longitude",
};
export default function SettingsPage() {
  const [tab, setTab] = useState(0),
    [data, setData] = useState(null),
    [records, setRecords] = useState([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [health, setHealth] = useState(null);
  useEffect(() => {
    fetch("/api/admin/settings/platform")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d.settings);
        setRecords(d.records);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const section = sections[tab];
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const revision = records.find((r) => r._id === section)?.revision || 0;
      const r = await fetch("/api/admin/settings/platform", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, value: data[section], revision }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRecords((rs) => [
        ...rs.filter((x) => x._id !== section),
        { _id: section, revision: d.revision },
      ]);
      setMessage("Settings saved.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  function change(key, value) {
    setData((d) => ({ ...d, [section]: { ...d[section], [key]: value } }));
  }
  async function refreshHealth() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/settings/monitoring");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setHealth(d);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-pad" style={{ maxWidth: 1200 }}>
      <h1 className="page-title">Platform settings</h1>
      <p className="page-sub">
        Manage Maxride operations. Financial history remains in its original
        currency.
      </p>
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-2 mb-4"
        style={{ flexWrap: "wrap" }}
      >
        {tabs.map((name, i) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === i}
            className={`btn btn-sm ${tab === i ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setTab(i);
              setMessage("");
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
      <div role="tabpanel" aria-label={tabs[tab]}>
        {tab === 0 && <BrandingSettings />}
        {tab === 5 && <PricingSettings />}
        {section && data && (
          <form onSubmit={save} className="card card-pad">
            <h2 className="mb-4">{tabs[tab]}</h2>
            {tab === 1 && (
              <p className="muted mb-4">
                Manual mode holds bookings for admin dispatch. Drivers still
                accept offers. Scheduled bookings dispatch after their requested
                time; one active booking per rider remains enforced.
              </p>
            )}
            {tab === 2 && (
              <p className="muted mb-4">
                Admin approval is mandatory. Suspension prevents new
                availability; active trips retain their settlement path.
              </p>
            )}
            {tab === 4 && (
              <p className="muted mb-4">
                In-app ride notifications are reconciled by the background
                worker and on inbox refresh. Email, SMS, WhatsApp and push: Not
                configured.
              </p>
            )}
            {tab === 6 && (
              <p className="muted mb-4">
                Rectangular service boundary. Existing map and routing
                implementation remains active.
              </p>
            )}
            {Object.entries(data[section]).map(([key, value]) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{labels[key] || key}</label>
                {["assignmentMode", "fallback", "routingMode"].includes(key) ? (
                  <select
                    id={key}
                    className="input"
                    value={value}
                    disabled={busy}
                    onChange={(e) => change(key, e.target.value)}
                  >
                    {(key === "assignmentMode"
                      ? ["automatic", "manual"]
                      : key === "routingMode"
                        ? ["osrm", "estimate"]
                        : ["no_drivers", "manual"]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {v.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : Array.isArray(value) ? (
                  <div>
                    {(key === "enabledCategories"
                      ? categories
                      : key === "enabledEvents"
                        ? events
                        : [
                            "license",
                            "insurance",
                            "registration",
                            "background_check",
                            "profile_photo",
                          ]
                    ).map((option) => (
                      <label key={option} className="flex gap-2">
                        <input
                          type="checkbox"
                        style={{ width: 'auto', alignSelf: 'flex-start' }}
                          disabled={busy}
                          checked={value.includes(option)}
                          onChange={(e) =>
                            change(
                              key,
                              e.target.checked
                                ? [...value, option]
                                : value.filter((x) => x !== option),
                            )
                          }
                        />
                        {option.replaceAll("_", " ")}
                      </label>
                    ))}
                  </div>
                ) : key === "templates" ? (
                  Object.entries(value).map(([event, text]) => (
                    <label key={event} className="field">
                      {event}
                      <input
                        className="input"
                        maxLength={300}
                        value={text}
                        disabled={busy}
                        onChange={(e) =>
                          change(key, { ...value, [event]: e.target.value })
                        }
                      />
                    </label>
                  ))
                ) : typeof value === "boolean" ? (
                  <input
                    id={key}
                    type="checkbox"
                        style={{ width: 'auto', alignSelf: 'flex-start' }}
                    checked={value}
                    disabled={busy}
                    onChange={(e) => change(key, e.target.checked)}
                  />
                ) : (
                  <input
                    id={key}
                    className="input"
                    type={typeof value === "number" ? "number" : "text"}
                    step="any"
                    required={!Array.isArray(value)}
                    disabled={busy}
                    value={
                      ["assignmentMode", "fallback", "routingMode"].includes(
                        key,
                      ) ? (
                        <select
                          id={key}
                          className="input"
                          value={value}
                          disabled={busy}
                          onChange={(e) => change(key, e.target.value)}
                        >
                          {(key === "assignmentMode"
                            ? ["automatic", "manual"]
                            : key === "routingMode"
                              ? ["osrm", "estimate"]
                              : ["no_drivers", "manual"]
                          ).map((v) => (
                            <option key={v} value={v}>
                              {v.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      ) : Array.isArray(value) ? (
                        value.join(", ")
                      ) : (
                        value
                      )
                    }
                    onChange={(e) =>
                      change(
                        key,
                        Array.isArray(value)
                          ? e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean)
                          : typeof value === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                      )
                    }
                  />
                )}
              </div>
            ))}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </button>
          </form>
        )}
        {section && !data && (
          <p>Settings unavailable or loading. Reload to retry.</p>
        )}
        {tab === 3 && <ProviderSettings kind="payment" />}
        {tab === 7 && (
          <section className="card card-pad mt-4">
            <h3>Access and audit</h3>
            <p>
              Only admins may edit settings. Riders and drivers cannot access
              settings APIs.
            </p>
            {records.map((r) => (
              <div key={r._id}>
                <strong>
                  {r._id} · revision {r.revision}
                </strong>
                {r.history
                  ?.slice(-5)
                  .reverse()
                  .map((h, i) => (
                    <p key={i} className="tiny">
                      {new Date(h.at).toLocaleString()} · {h.actor} ·{" "}
                      {h.fields.join(", ")}
                    </p>
                  ))}
              </div>
            ))}
          </section>
        )}
        {tab === 8 && <ProviderSettings kind="notification" />}
        {tab === 9 && (
          <section className="card card-pad">
            <h2>System & Monitoring</h2>
            <button
              className="btn btn-secondary mt-4"
              disabled={busy}
              onClick={refreshHealth}
            >
              {busy ? "Checking…" : "Refresh health"}
            </button>
            {health && <div className="grid-2 mt-4">{Object.entries(health.checks).map(([name,status])=><article className="card card-pad" key={name}><h3>{name === 'mongo' ? 'MongoDB' : name === 'redis' ? 'Redis' : 'Socket.IO'}</h3><p className={status === 'up' ? 'badge badge-success' : 'badge badge-warning'}>{status}</p></article>)}<article className="card card-pad"><h3>Notification queue</h3><p>Worker: {health.notifications.worker}</p>{health.notifications.queue.map(q=><p key={q._id}>{q._id}: {q.count}</p>)}<p className="small muted">Version {health.version}</p></article></div>}
            {health && (
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(health, null, 2)}
              </pre>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
