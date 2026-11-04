"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeft, CheckCircle2, Wallet } from "lucide-react";
import { Avatar, Loading, money } from "@/components/ui/bits";
import { useToast } from "@/components/ui/Toast";
export async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export function Field({ label, children }) {
  return (
    <label className="account-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ProfileFields({ value, onChange }) {
  return (
    <div className="account-grid">
      {[
        ["name", "Full name", "text"],
        ["username", "Username", "text"],
        ["email", "Email", "email"],
        ["phone", "Phone", "tel"],
      ].map(([key, label, type]) => (
        <Field key={key} label={label}>
          <input
            className="input"
            type={type}
            required={key === "name" || key === "username"}
            value={value[key] || ""}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </Field>
      ))}
    </div>
  );
}
export function AccountsList({ drivers = false }) {
  const [approval, setApproval] = useState("");
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [role, setRole] = useState(drivers ? "driver" : ""),
    [active, setActive] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api(
        `/api/admin/users?${new URLSearchParams({ q, role, active, approval, page: String(page) })}`,
      )
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, role, active, approval, page]);
  return (
    <div className="content-pad account-page">
      <header className="account-heading">
        <div>
          <h1 className="page-title">{drivers ? "Drivers" : "Users"}</h1>
          <p className="page-sub">
            {drivers
              ? "Fleet profiles, approvals and earnings"
              : "Accounts, access and wallet activity"}
          </p>
        </div>
        <Link
          className="btn btn-primary"
          href={`/admin/users/new${drivers ? "?role=driver" : ""}`}
        >
          <Plus size={17} />
          Add {drivers ? "driver" : "user"}
        </Link>
      </header>
      <div className="account-filters">
        <input
          aria-label="Search accounts"
          className="input"
          placeholder="Search name or username"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        {drivers && (
          <select
            className="input"
            aria-label="Driver approval"
            value={approval}
            onChange={(e) => {
              setApproval(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All approvals</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        )}
        {!drivers && (
          <select
            aria-label="Role"
            className="input"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="rider">Riders</option>
            <option value="driver">Drivers</option>
            <option value="admin">Administrators</option>
          </select>
        )}
        <select
          aria-label="Account status"
          className="input"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All accounts</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <Loading />}
      <div className="card account-directory">
        {data?.users.map((u) => (
          <Link
            key={u._id}
            href={`/admin/users/${u._id}`}
            className="account-row"
          >
            <Avatar name={u.name} size="sm" />
            <div className="account-row-name">
              <strong>{u.name}</strong>
              <span className="muted small">
                @{u.username} · {u.role}
              </span>
            </div>
            <span className="badge badge-neutral">
              {u.isActive ? "Active" : "Inactive"}
            </span>
            <span className="account-balances">
              {money(u.wallet?.balance, u.wallet?.currency ?? null)}
              {u.wallet?.currency !== "EGP" && (
                <small>
                  {money(u.egpWallet?.balance || 0, "EGP")} · separate account
                </small>
              )}
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
        {data?.users.length === 0 && (
          <p className="account-section">No accounts match your search.</p>
        )}
      </div>
      {data && (
        <div className="account-pagination">
          <button
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.max(1, data.pagination.pages)} ·{" "}
            {data.pagination.total} accounts
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= data.pagination.pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
export function NewAccount() {
  const router = useRouter(),
    toast = useToast(),
    lock = useRef(false);
  const [value, setValue] = useState({
      name: "",
      username: "",
      email: "",
      phone: "",
      role: "rider",
      password: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("role") === "driver")
      setValue((v) => ({ ...v, role: "driver" }));
  }, []);
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/admin/users", "POST", value);
      toast("Account created successfully", "success");
      router.push(`/admin/users/${d.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="content-pad account-page">
      <Link href="/admin/users" className="btn btn-ghost">
        <ArrowLeft size={16} />
        Users
      </Link>
      <h1 className="page-title">Create account</h1>
      <p className="page-sub">
        New accounts start with a zero EGP balance. Drivers require approval.
      </p>
      <form className="card account-section" onSubmit={save}>
        <ProfileFields value={value} onChange={setValue} />
        <div className="account-grid">
          <Field label="Account role">
            <select
              className="input"
              value={value.role}
              onChange={(e) => setValue({ ...value, role: e.target.value })}
            >
              <option value="rider">Rider</option>
              <option value="driver">Driver</option>
            </select>
          </Field>
          <Field label="Initial password">
            <input
              className="input"
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              required
              value={value.password}
              onChange={(e) => setValue({ ...value, password: e.target.value })}
            />
            <small>
              At least 12 characters. Share privately with the account owner.
            </small>
          </Field>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="account-actions">
          <Link href="/admin/users" className="btn btn-secondary">
            Cancel
          </Link>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}
export function AccountDetail({ id }) {
  const [baseline, setBaseline] = useState("");
  const [data, setData] = useState(null),
    [draft, setDraft] = useState(null),
    [tab, setTab] = useState("profile"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState("");
  const toast = useToast(),
    lock = useRef(false);
  const load = useCallback(async () => {
    const d = await api(`/api/admin/users/${id}`);
    setData(d);
    const nextDraft = {
      name: d.user.name,
      username: d.user.username,
      email: d.user.email || "",
      phone: d.user.phone || "",
      isActive: d.user.isActive,
      ...(d.driver
        ? {
            driver: {
              vehicle: {
                make: d.driver.vehicle?.make || "",
                model: d.driver.vehicle?.model || "",
                color: d.driver.vehicle?.color || "",
                plate: d.driver.vehicle?.plate || "",
                type: d.driver.vehicle?.type || "economy",
                ...(d.driver.vehicle?.year
                  ? { year: d.driver.vehicle.year }
                  : {}),
              },
              license: {
                number: d.driver.license?.number || "",
                expiry: d.driver.license?.expiry?.slice(0, 10) || "",
                verified: d.driver.license?.verified || false,
              },
              documents: (d.driver.documents || []).map(
                ({ type, url, verified, rejectionReason }) => ({
                  type,
                  url,
                  verified,
                  rejectionReason: rejectionReason || "",
                }),
              ),
              isApproved: d.driver.isApproved,
              suspensionReason: d.driver.suspensionReason || "",
            },
          }
        : {}),
    };
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
  }, [id]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/users/${id}`, "PATCH", draft);
      await load();
      setSaved(new Date().toLocaleTimeString());
      toast("Account saved successfully", "success");
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="content-pad">
        {error ? <p role="alert">{error}</p> : <Loading />}
      </div>
    );
  const driver = draft.driver,
    changeDriver = (v) => setDraft({ ...draft, driver: { ...driver, ...v } });
  return (
    <div className="content-pad account-page">
      <Link
        href={data.driver ? "/admin/drivers" : "/admin/users"}
        className="btn btn-ghost"
      >
        <ArrowLeft size={16} />
        Back to directory
      </Link>
      <header className="account-heading">
        <div className="flex items-center gap-3">
          <Avatar name={data.user.name} src={data.user.avatar} size="lg" />
          <div>
            <h1 className="page-title">{data.user.name}</h1>
            <p className="page-sub">
              @{data.user.username} · {data.user.role} ·{" "}
              {data.user.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        </div>
        <span className="muted small">
          Joined {new Date(data.user.createdAt).toLocaleDateString()}
        </span>
      </header>
      <nav className="account-tabs" aria-label="Account details">
        {[
          "profile",
          ...(driver ? ["vehicle", "documents"] : []),
          "wallet",
          "activity",
        ].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p className="account-saved" role="status">
          <CheckCircle2 size={18} />
          Account saved successfully · {saved}
        </p>
      )}
      {["profile", "vehicle", "documents"].includes(tab) && (
        <form onSubmit={save}>
          <section className="card account-section">
            {tab === "profile" && (
              <>
                <h2>Account information</h2>
                <ProfileFields value={draft} onChange={setDraft} />
                <p className="muted small">
                  Last sign-in:{" "}
                  {data.user.lastLoginAt
                    ? new Date(data.user.lastLoginAt).toLocaleString()
                    : "Never"}
                </p>
                {data.user.role !== "admin" && (
                  <div className="account-access">
                    <h3>Account access</h3>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(e) =>
                          setDraft({ ...draft, isActive: e.target.checked })
                        }
                      />{" "}
                      Account active
                    </label>
                    {driver && (
                      <>
                        <label>
                          <input
                            type="checkbox"
                            checked={driver.isApproved}
                            onChange={(e) =>
                              changeDriver({ isApproved: e.target.checked })
                            }
                          />{" "}
                          Driver approved to operate
                        </label>
                        <Field label="Suspension reason">
                          <textarea
                            className="input"
                            value={driver.suspensionReason}
                            maxLength={300}
                            onChange={(e) =>
                              changeDriver({ suspensionReason: e.target.value })
                            }
                          />
                        </Field>
                        <small>
                          All required documents must be verified before
                          approval. Suspend only after any active ride is
                          complete.
                        </small>
                      </>
                    )}
                  </div>
                )}
                {data.user.role === "admin" && (
                  <Link href="/admin/profile" className="btn btn-secondary">
                    Edit my administrator profile
                  </Link>
                )}
              </>
            )}
            {tab === "vehicle" && (
              <>
                <h2>Vehicle & licence</h2>
                <div className="account-grid">
                  {["make", "model", "color", "plate"].map((k) => (
                    <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                      <input
                        className="input"
                        value={driver.vehicle[k]}
                        onChange={(e) =>
                          changeDriver({
                            vehicle: { ...driver.vehicle, [k]: e.target.value },
                          })
                        }
                      />
                    </Field>
                  ))}
                  <Field label="Model year">
                    <input
                      className="input"
                      type="number"
                      min="1980"
                      max={new Date().getFullYear() + 1}
                      value={driver.vehicle.year || ""}
                      onChange={(e) =>
                        changeDriver({
                          vehicle: {
                            ...driver.vehicle,
                            year: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Category">
                    <select
                      className="input"
                      value={driver.vehicle.type}
                      onChange={(e) =>
                        changeDriver({
                          vehicle: { ...driver.vehicle, type: e.target.value },
                        })
                      }
                    >
                      {["economy", "comfort", "premium", "xl"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Licence number">
                    <input
                      className="input"
                      value={driver.license.number}
                      onChange={(e) =>
                        changeDriver({
                          license: {
                            ...driver.license,
                            number: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Licence expiry">
                    <input
                      className="input"
                      type="date"
                      value={driver.license.expiry}
                      onChange={(e) =>
                        changeDriver({
                          license: {
                            ...driver.license,
                            expiry: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              </>
            )}
            {tab === "documents" && (
              <>
                <h2>Documents & review</h2>
                <p className="muted">
                  Review the uploaded evidence before marking a document
                  verified.
                </p>
                {driver.documents.map((d, i) => (
                  <div className="account-document" key={i}>
                    <div className="account-grid">
                      <Field label="Document type">
                        <select
                          className="input"
                          value={d.type}
                          onChange={(e) =>
                            changeDriver({
                              documents: driver.documents.map((v, j) =>
                                j === i ? { ...v, type: e.target.value } : v,
                              ),
                            })
                          }
                        >
                          {[
                            "license",
                            "insurance",
                            "registration",
                            "background_check",
                            "profile_photo",
                          ].map((v) => (
                            <option key={v} value={v}>
                              {v.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Secure document URL">
                        <input
                          className="input"
                          type="url"
                          value={d.url}
                          onChange={(e) =>
                            changeDriver({
                              documents: driver.documents.map((v, j) =>
                                j === i ? { ...v, url: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="Review notes">
                        <input
                          className="input"
                          value={d.rejectionReason}
                          onChange={(e) =>
                            changeDriver({
                              documents: driver.documents.map((v, j) =>
                                j === i
                                  ? { ...v, rejectionReason: e.target.value }
                                  : v,
                              ),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="account-actions">
                      <label>
                        <input
                          type="checkbox"
                          checked={d.verified}
                          onChange={(e) =>
                            changeDriver({
                              documents: driver.documents.map((v, j) =>
                                j === i
                                  ? { ...v, verified: e.target.checked }
                                  : v,
                              ),
                            })
                          }
                        />{" "}
                        Verified
                      </label>
                      {d.url.startsWith("https://") && (
                        <a
                          className="btn btn-secondary"
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View evidence
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          changeDriver({
                            documents: driver.documents.filter(
                              (_, j) => i !== j,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    changeDriver({
                      documents: [
                        ...driver.documents,
                        {
                          type: "license",
                          url: "",
                          verified: false,
                          rejectionReason: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Add document
                </button>
              </>
            )}
          </section>
          {data.user.role !== "admin" && (
            <div className="account-savebar">
              <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !dirty}
                onClick={() => {
                  setError("");
                  load();
                }}
              >
                Cancel changes
              </button>
              <button className="btn btn-primary" disabled={busy || !dirty}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </form>
      )}
      {tab === "wallet" && <WalletAdmin id={id} />}
      {tab === "activity" && (
        <section className="card account-section">
          <h2>Trips & account activity</h2>
          {data.earnings.map((e) => (
            <p key={e._id}>
              Lifetime completed earnings: {money(e.total, e._id)} · {e.trips}{" "}
              trips
            </p>
          ))}
          <h3>Recent trips</h3>
          {!data.trips.length && <p className="muted">No trips yet.</p>}
          {data.trips.map((t) => (
            <div className="account-history" key={t._id}>
              <strong>
                {t.pickup?.address} → {t.dropoff?.address}
              </strong>
              <span>
                {t.status} · {money(t.fare?.total, t.fare?.currency ?? null)} ·{" "}
                {new Date(t.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
          <h3>Audit history</h3>
          {data.audit.map((a) => (
            <div className="account-history" key={a._id}>
              <span>
                {a.action.replaceAll(".", " ")} ·{" "}
                {a.actorId?.name || "Administrator"}
              </span>
              <small>{new Date(a.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function WalletAdmin({ id }) {
  const [data, setData] = useState(null),
    [page, setPage] = useState(1),
    [currency, setCurrency] = useState("EGP"),
    [direction, setDirection] = useState("credit"),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const lock = useRef(false),
    toast = useToast();
  const load = useCallback(
    () => api(`/api/admin/users/${id}/wallet?page=${page}`).then(setData),
    [id, page],
  );
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function post() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/users/${id}/wallet`, "POST", preview);
      await load();
      setPreview(null);
      setAmount("");
      setReason("");
      setReference("");
      setSuccess("Wallet adjustment posted successfully");
      toast("Wallet adjustment posted successfully", "success");
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const balance =
      data?.accounts.find((a) => a.currency === currency)?.balance || 0,
    after =
      Math.round(
        (balance + (direction === "credit" ? 1 : -1) * Number(amount)) * 100,
      ) / 100;
  return (
    <section className="card account-section">
      <h2>
        <Wallet size={20} /> Wallet accounts
      </h2>
      <p className="muted">
        Currencies remain separate. Manual adjustments are audited and do not
        represent external gateway payments.
      </p>
      <div className="account-grid">
        {data?.accounts.map((a, i) => (
          <div className="account-balance" key={i}>
            <small>
              {a.currency || "Currency unverified"}
              {a.currency !== "EGP"
                ? " · historical account"
                : " · ride account"}
            </small>
            <strong>{money(a.balance, a.currency ?? null)}</strong>
          </div>
        ))}
      </div>
      {data?.legacyRecord && (
        <p className="account-saved" role="note">
          Original wallet preserved:{" "}
          {money(
            data.legacyRecord.wallet.balance,
            data.legacyRecord.wallet.currency,
          )}{" "}
          · {new Date(data.legacyRecord.preservedAt).toLocaleString()} ·{" "}
          {data.legacyRecord.operation}. This immutable snapshot is separate
          from operational EGP funds.
        </p>
      )}
      <form
        inert={!!preview || busy}
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setSuccess("");
          setPreview({
            currency,
            direction,
            amount: Number(amount),
            reason,
            reference,
            idempotencyKey: crypto.randomUUID(),
            confirmed: true,
          });
        }}
      >
        <h3>Manual adjustment</h3>
        <div className="account-grid">
          <Field label="Currency">
            <select
              className="input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {data?.accounts
                .filter((a) => ["EGP", "USD"].includes(a.currency))
                .map((a) => (
                  <option key={a.currency}>{a.currency}</option>
                ))}
            </select>
          </Field>
          <Field label="Adjustment">
            <select
              className="input"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="credit">Add balance</option>
              <option value="debit">Deduct balance</option>
            </select>
          </Field>
          <Field label="Amount">
            <input
              className="input"
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Reference (optional)">
            <input
              className="input"
              value={reference}
              maxLength={100}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <input
              className="input"
              required
              minLength={5}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
        <p>
          Before: <strong>{money(balance, currency)}</strong> → After:{" "}
          <strong>{money(after, currency)}</strong>
        </p>
        <button
          className="btn btn-primary"
          disabled={busy || after < 0 || !!preview}
        >
          Review adjustment
        </button>
      </form>
      {preview && (
        <div
          className="account-confirm"
          role="region"
          aria-label="Confirm wallet adjustment"
        >
          <h3>
            Confirm {preview.direction === "credit" ? "credit" : "deduction"}
          </h3>
          <p>
            {money(preview.amount, preview.currency)} · {preview.reason}
          </p>
          <p>
            The balance will be checked again when posted. This creates a
            permanent audit entry.
          </p>
          <div className="account-actions">
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={post}>
              {busy ? "Posting…" : "Confirm and post"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="account-saved">
          <CheckCircle2 size={18} />
          {success}
        </p>
      )}
      <h3>Transaction history</h3>
      {data?.transactions.length === 0 && (
        <p className="muted">No wallet transactions yet.</p>
      )}
      {data?.transactions.map((t) => (
        <div className="account-history" key={t._id}>
          <div className="flex justify-between gap-2">
            <strong>{t.type.replaceAll("_", " ")}</strong>
            <strong>{money(t.amount, t.currency ?? null)}</strong>
          </div>
          <span>{t.reason || t.note || "—"}</span>
          <small>
            {new Date(t.createdAt).toLocaleString()} · {t.actorName || "System"}{" "}
            · Reference: {t.reference || t.ref || String(t._id)}
          </small>
          <small>
            Balance after: {money(t.balanceAfter, t.currency ?? null)}
          </small>
        </div>
      ))}
      <div className="account-pagination">
        <button
          className="btn btn-secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="btn btn-secondary"
          disabled={!data || page >= data.pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
