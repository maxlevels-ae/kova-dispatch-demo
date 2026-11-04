"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, CreditCard, Plug } from "lucide-react";
import { providerSchema } from "@/lib/provider-config";
import {
  SettingsSection,
  SettingsField,
  SettingsSelect,
  SettingsCheckboxGroup,
  SettingsSaveBar,
  SettingsStatus,
  SettingsEmptyState,
  useSettingsDirty,
} from "./settings/SettingsUI";
export default function ProviderSettings({ kind, onDirty }) {
  const [providers, setProviders] = useState([]),
    [saved, setSaved] = useState([]),
    [selected, setSelected] = useState(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState({}),
    [loaded, setLoaded] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    fetch("/api/admin/settings/providers")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setProviders(d.providers);
        setSaved(d.providers);
        setLoaded(true);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const changed = (p) =>
    JSON.stringify(p.value) !==
    JSON.stringify(saved.find((s) => s.id === p.id)?.value);
  useSettingsDirty(
    kind === "payment" ? "payment" : "integrations",
    providers.some(changed),
    onDirty,
  );
  const p = providers.find((p) => p.id === selected);
  function edit(key, value) {
    setProviders((ps) =>
      ps.map((p) =>
        p.id === selected ? { ...p, value: { ...p.value, [key]: value } } : p,
      ),
    );
    setErrors({});
    setMessage("");
  }
  async function save(e) {
    e.preventDefault();
    if (lock.current || !changed(p)) return;
    const parsed = providerSchema.safeParse(p.value);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join("."), i.message]),
        ),
      );
      setMessage("Review the highlighted fields.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          value: parsed.data,
          revision: p.revision,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      const updated = { ...p, value: parsed.data, revision: d.revision };
      setProviders((ps) => ps.map((x) => (x.id === p.id ? updated : x)));
      setSaved((ps) => ps.map((x) => (x.id === p.id ? updated : x)));
      setMessage(
        `${p.name} configuration saved. External processing remains disabled.`,
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div>
      <p role="status" className="settings-feedback">
        {message}
      </p>
      {!loaded && (
        <SettingsEmptyState title="Provider directory unavailable or loading">
          Reload this page to retry if loading does not complete.
        </SettingsEmptyState>
      )}
      {!p ? (
        <>
          <div className="settings-directory">
            {providers
              .filter((p) => p.kind === kind)
              .map((p) => (
                <article key={p.id}>
                  <div className="settings-provider-icon">
                    {kind === "payment" ? (
                      <CreditCard size={20} />
                    ) : (
                      <Plug size={20} />
                    )}
                  </div>
                  <div className="settings-provider-name">
                    <h3>{p.name}</h3>
                    <SettingsStatus>{p.status}</SettingsStatus>
                  </div>
                  <div className="settings-provider-meta">
                    <span>
                      {p.value.mode === "sandbox" ? "Sandbox" : "Live plan"}
                    </span>
                    <small>
                      {kind === "payment" ? "EGP · Inactive" : "Inactive"}
                    </small>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSelected(p.id);
                      setErrors({});
                      setMessage("");
                    }}
                  >
                    Configure <ArrowUpRight size={14} />
                  </button>
                  {changed(p) && <small>Unsaved changes</small>}
                </article>
              ))}
          </div>
          <SettingsEmptyState title="Configuration is separate from activation">
            Credentials stay in managed server secrets. Connections remain
            inactive until adapter eligibility and sandbox flows are verified.
          </SettingsEmptyState>
        </>
      ) : (
        <form onSubmit={save} noValidate>
          <div className="settings-toolbar">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft size={15} /> All{" "}
              {kind === "payment" ? "providers" : "integrations"}
            </button>
            <SettingsStatus>Inactive · {p.connection}</SettingsStatus>
          </div>
          <SettingsSection
            title={`${p.name} · Merchant identity`}
            description="Save a configuration plan for this provider."
          >
            <div className="settings-fields">
              <SettingsField
                label="Provider display name"
                value={p.value.name}
                maxLength={80}
                disabled={busy}
                error={errors.name}
                onChange={(e) => edit("name", e.target.value)}
              />
              <SettingsField
                label="Merchant / account ID"
                value={p.value.accountId}
                maxLength={120}
                disabled={busy}
                error={errors.accountId}
                onChange={(e) => edit("accountId", e.target.value)}
              />
            </div>
          </SettingsSection>
          <SettingsSection
            title="Credentials status"
            description="Secret values are never returned to the browser."
          >
            <div className="settings-status-list">
              <div>
                <span>
                  API credential<small>{p.credential}</small>
                </span>
                <SettingsStatus>
                  {p.credentialConfigured
                    ? "Configured · masked"
                    : "Not configured"}
                </SettingsStatus>
              </div>
              {p.webhookSecret && (
                <div>
                  <span>
                    Webhook signature secret<small>{p.webhookSecret}</small>
                  </span>
                  <SettingsStatus>
                    {p.webhookSecretConfigured
                      ? "Configured · masked"
                      : "Not configured"}
                  </SettingsStatus>
                </div>
              )}
            </div>
          </SettingsSection>
          {kind === "payment" && (
            <SettingsSection
              title="Payment methods"
              description="Planned methods only. Availability requires provider verification."
            >
              <SettingsCheckboxGroup
                label="Supported methods"
                options={["card", "wallet", "cash_reference"]}
                value={p.value.methods}
                onChange={(v) => edit("methods", v)}
                disabled={busy}
              />
            </SettingsSection>
          )}
          <SettingsSection
            title="Webhook configuration"
            description="Saving this URL does not register a webhook."
          >
            <SettingsField
              label="Planned webhook URL (not registered)"
              type="url"
              value={p.value.webhookUrl}
              maxLength={500}
              error={errors.webhookUrl}
              disabled={busy}
              hint="Use an HTTPS endpoint, or leave empty."
              onChange={(e) => edit("webhookUrl", e.target.value)}
            />
          </SettingsSection>
          <SettingsSection title="Sandbox / live configuration">
            <SettingsSelect
              label="Configuration mode"
              value={p.value.mode}
              disabled={busy}
              onChange={(e) => edit("mode", e.target.value)}
              options={[
                { value: "sandbox", label: "Sandbox" },
                { value: "live", label: "Live (activation locked)" },
              ]}
            />
            {kind === "payment" && (
              <p className="settings-hint">Supported currency: EGP</p>
            )}
          </SettingsSection>
          <SettingsSection title="Connection readiness">
            <SettingsEmptyState title="Verification required">
              {p.reason}
            </SettingsEmptyState>
            {p.docs && (
              <a href={p.docs} target="_blank" rel="noreferrer">
                Official provider documentation ↗
              </a>
            )}
          </SettingsSection>
          <SettingsSaveBar
            dirty={changed(p)}
            busy={busy}
            onDiscard={() => {
              setProviders((ps) =>
                ps.map((x) =>
                  x.id === p.id ? saved.find((s) => s.id === p.id) : x,
                ),
              );
              setErrors({});
              setMessage("Changes discarded.");
            }}
          />
        </form>
      )}
    </div>
  );
}
