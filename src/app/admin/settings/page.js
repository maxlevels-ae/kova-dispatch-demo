"use client";
import { useCallback, useEffect, useState } from "react";
import Link from 'next/link';
import {
  Building2,
  Route,
  Car,
  MapPin,
  CreditCard,
  Coins,
  Bell,
  Plug,
  Shield,
  Activity,
  RefreshCw,
} from "lucide-react";
import BrandingSettings from "@/components/BrandingSettings";
import ProviderSettings from "@/components/ProviderSettings";
import PricingSettings from "@/components/settings/PricingSettings";
import PlatformForm from "@/components/settings/PlatformForm";
import {
  SettingsLayout,
  SettingsNavigation,
  SettingsPageHeader,
  SettingsSection,
  SettingsStatus,
  SettingsEmptyState,
} from "@/components/settings/SettingsUI";
const groups = [
  {
    name: "Company",
    items: [
      {
        id: "branding",
        title: "General & Branding",
        icon: Building2,
        description: "Your company identity, logos and regional preferences.",
      },
      {
        id: "security",
        title: "Users & Security",
        icon: Shield,
        description: "Control access and keep your workspace accountable.",
      },
    ],
  },
  {
    name: "Operations",
    items: [
      {id:"operating-areas",title:"Countries & Service Zones",icon:Route},
      {
        id: "dispatch",
        title: "Bookings & Dispatch",
        icon: Route,
        description:
          "Shape how bookings reach drivers, from matching to fallback.",
      },
      {
        id: "fleet",
        title: "Drivers & Fleet",
        icon: Car,
        description: "Set clear standards for your drivers and vehicles.",
      },
      {
        id: "maps",
        title: "Maps & Appearance",
        icon: MapPin,
        description: "Configure map appearance, routing and live driver display.",
      },
    ],
  },
  {
    name: "Finance",
    items: [
      {
        id: "payment",
        title: "Payment Gateways",
        icon: CreditCard,
        description:
          "Manage provider configuration and review connection readiness.",
      },
      {
        id: "pricing",
        title: "Pricing & Commission",
        icon: Coins,
        description:
          "Transparent EGP fares and commissions for every service tier.",
      },
    ],
  },
  {
    name: "Platform",
    items: [
      {
        id: "notifications",
        title: "Notifications",
        icon: Bell,
        description: "Choose when customers and drivers hear from you.",
      },
      {
        id: "integrations",
        title: "Integrations",
        icon: Plug,
        description: "Manage external delivery services in one place.",
      },
      {
        id: "monitoring",
        title: "System & Monitoring",
        icon: Activity,
        description: "A live view of the services that keep Maxride running.",
      },
    ],
  },
];
export default function SettingsPage() {
  const [active, setActive] = useState("branding"),
    [visited, setVisited] = useState({ branding: true }),
    [data, setData] = useState(null),
    [records, setRecords] = useState([]),
    [dirty, setDirty] = useState({}),
    [error, setError] = useState(""),
    [health, setHealth] = useState(null),
    [checking, setChecking] = useState(true),
    [healthError, setHealthError] = useState("");
  const onDirty = useCallback(
    (id, value) =>
      setDirty((d) => (d[id] === value ? d : { ...d, [id]: value })),
    [],
  );
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/settings/platform");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d.settings);
      setRecords(d.records);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/settings/monitoring");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setHealth(d);
      setHealthError("");
    } catch (e) {
      setHealthError(e.message);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    load();
    refresh();
  }, [load, refresh]);
  function navigate(id) {
    if(id==='operating-areas'){window.location.assign('/admin/settings/operating-areas');return;}
    setActive(id);
    setVisited((v) => ({ ...v, [id]: true }));
  }
  function saved(id, revision) {
    setRecords((rs) =>
      rs
        .map((r) => (r._id === id ? { ...r, revision } : r))
        .concat(rs.some((r) => r._id === id) ? [] : [{ _id: id, revision }]),
    );
  }
  return (
    <SettingsLayout
      navigation={
        <SettingsNavigation
          groups={groups}
          active={active}
          onChange={navigate}
          dirty={dirty}
        />
      }
    >
      <div className="flex gap-2 wrap mb-4"><Link className="btn btn-secondary" href="/admin/settings/services">Taxi / Delivery switches →</Link><Link className="btn btn-secondary" href="/admin/settings/delivery">Delivery settings →</Link></div>
      {groups
        .flatMap((g) => g.items)
        .map(
          (item) =>
            visited[item.id] && (
              <div key={item.id} hidden={active !== item.id}>
                <SettingsPageHeader
                  title={item.title}
                  description={item.description}
                />
                {item.id === "branding" && (
                  <BrandingSettings
                    onDirty={onDirty}
                    localization={data?.maps}
                  />
                )}
                {item.id === "pricing" && <PricingSettings onDirty={onDirty} />}
                {item.id === "payment" && (
                  <ProviderSettings kind="payment" onDirty={onDirty} />
                )}
                {item.id === "integrations" && (
                  <ProviderSettings kind="notification" onDirty={onDirty} />
                )}
                {[
                  "dispatch",
                  "fleet",
                  "maps",
                  "notifications",
                  "security",
                ].includes(item.id) &&
                  (data ? (
                    <PlatformForm
                      id={item.id}
                      initial={data[item.id]}
                      records={records}
                      onSaved={saved}
                      onDirty={onDirty}
                      monitoring={health}
                    />
                  ) : (
                    <SettingsEmptyState title={error || "Loading settings…"}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={load}
                      >
                        Retry loading
                      </button>
                    </SettingsEmptyState>
                  ))}
                {item.id === "monitoring" && (
                  <>
                    <div className="settings-toolbar">
                      <SettingsStatus>
                        {health
                          ? "Latest service check"
                          : "Awaiting service check"}
                      </SettingsStatus>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setChecking(true);
                          refresh();
                        }}
                        disabled={checking}
                      >
                        <RefreshCw size={15} />
                        {checking ? "Checking…" : "Refresh health"}
                      </button>
                    </div>
                    <p role="status" className="settings-error">
                      {healthError}
                    </p>
                    {health && (
                      <>
                        <div className="settings-health-grid">
                          {Object.entries(health.checks).map(
                            ([name, status]) => (
                              <article key={name}>
                                <Activity size={19} />
                                <h3>
                                  {{
                                    mongo: "MongoDB",
                                    redis: "Redis",
                                    socket: "Socket.IO",
                                  }[name] || name}
                                </h3>
                                <SettingsStatus>{status}</SettingsStatus>
                              </article>
                            ),
                          )}
                          <article>
                            <Bell size={19} />
                            <h3>Notification workers</h3>
                            <SettingsStatus>
                              {health.notifications.worker}
                            </SettingsStatus>
                          </article>
                        </div>
                        <SettingsSection
                          title="Notification queue"
                          description={health.notifications.reconciliation}
                        >
                          {health.notifications.queue.length ? (
                            <div className="settings-status-list">
                              {health.notifications.queue.map((q) => (
                                <div key={q._id}>
                                  <strong>{q._id}</strong>
                                  <span>{q.count} jobs</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <SettingsEmptyState title="Queue is clear">
                              No notification jobs are waiting.
                            </SettingsEmptyState>
                          )}
                        </SettingsSection>
                        <SettingsSection title="Operational errors">
                          {health.operationalErrors.length ? (
                            health.operationalErrors.map((e, i) => (
                              <div className="settings-audit" key={e._id || i}>
                                <strong>
                                  {e.code || e.source || "Operational error"}
                                </strong>
                                <p>
                                  {e.message ||
                                    "Review developer details for diagnostic context."}
                                </p>
                              </div>
                            ))
                          ) : (
                            <SettingsEmptyState title="No operational errors recorded">
                              Service errors will appear here for review.
                            </SettingsEmptyState>
                          )}
                        </SettingsSection>
                        <details className="settings-developer">
                          <summary>Developer details</summary>
                          <pre>{JSON.stringify(health, null, 2)}</pre>
                        </details>
                      </>
                    )}
                  </>
                )}
              </div>
            ),
        )}
    </SettingsLayout>
  );
}
