"use client";
import { useEffect, useState } from "react";
export default function ProviderSettings({ kind }) {
  const [providers, setProviders] = useState([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/admin/settings/providers")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setProviders(d.providers);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  function edit(id, key, value) {
    setProviders((ps) =>
      ps.map((p) =>
        p.id === id ? { ...p, value: { ...p.value, [key]: value } } : p,
      ),
    );
  }
  async function save(p) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          value: p.value,
          revision: p.revision,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setProviders((ps) =>
        ps.map((x) => (x.id === p.id ? { ...x, revision: d.revision } : x)),
      );
      setMessage(
        `${p.value.name} saved; external processing remains disabled.`,
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p role="status">{message}</p>
      <p className="mb-4">
        Credentials use managed server-side environment secrets. Configure the
        named secret in the deployment environment; secret values are never
        returned here. Activation and connection testing remain unavailable
        until an adapter and sandbox flow are verified.
      </p>
      <div className="grid-2">
        {providers
          .filter((p) => p.kind === kind)
          .map((p) => (
            <form
              key={p.id}
              className="card card-pad"
              onSubmit={(e) => {
                e.preventDefault();
                save(p);
              }}
            >
              <h3>
                {p.name} · {p.status}
              </h3>
              <p className="small muted">Inactive · {p.connection}</p>
              {["name", "accountId", "webhookUrl"].map((key) => (
                <label className="field" key={key}>
                  {key === "accountId"
                    ? "Merchant / account ID"
                    : key === "webhookUrl"
                      ? "Planned webhook URL (not registered)"
                      : "Provider display name"}
                  <input
                    className="input"
                    value={p.value[key]}
                    disabled={busy}
                    maxLength={key === "webhookUrl" ? 500 : 120}
                    onChange={(e) => edit(p.id, key, e.target.value)}
                  />
                </label>
              ))}
              <label className="field">
                Configuration mode
                <select
                  className="input"
                  value={p.value.mode}
                  disabled={busy}
                  onChange={(e) => edit(p.id, "mode", e.target.value)}
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="live">Live (activation locked)</option>
                </select>
              </label>
              <p>Currency: EGP</p>
              {p.kind === "payment" && (
                <fieldset>
                  <legend>Planned payment methods</legend>
                  {["card", "wallet", "cash_reference"].map((m) => (
                    <label key={m} className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={p.value.methods.includes(m)}
                        disabled={busy}
                        onChange={(e) =>
                          edit(
                            p.id,
                            "methods",
                            e.target.checked
                              ? [...p.value.methods, m]
                              : p.value.methods.filter((x) => x !== m),
                          )
                        }
                      />
                      {m}
                    </label>
                  ))}
                </fieldset>
              )}
              <p className="tiny mt-3">
                {p.credential}:{" "}
                {p.credentialConfigured
                  ? "Configured (masked)"
                  : "Not configured"}
              </p>
              {p.webhookSecret && (
                <p className="tiny">
                  {p.webhookSecret}:{" "}
                  {p.webhookSecretConfigured
                    ? "Configured (masked)"
                    : "Not configured"}
                </p>
              )}
              <p className="small muted mt-3">{p.reason}</p>
              {p.docs && (
                <p>
                  <a href={p.docs} target="_blank" rel="noreferrer">
                    Official provider documentation
                  </a>
                </p>
              )}
              <button className="btn btn-primary mt-3" disabled={busy}>
                {busy ? "Saving…" : "Save configuration"}
              </button>
            </form>
          ))}
      </div>
    </div>
  );
}
