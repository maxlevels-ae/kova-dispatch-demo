"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
export default function NotificationInbox() {
  const { data: session } = useSession();
  const [preference, setPreference] = useState(true);
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/notifications");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setItems(d.notifications);
      setPreference(d.preference);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function markRead() {
    setBusy(true);
    try {
      const r = await fetch("/api/notifications", { method: "PATCH" });
      if (!r.ok) throw Error("Unable to mark notifications read");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function togglePreference() {
    setBusy(true);
    try {
      const r = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inApp: !preference }),
      });
      if (!r.ok) throw Error("Unable to save preference");
      setPreference(!preference);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!session?.user) return null;
  return (
    <details
      style={{
        position: "fixed",
        bottom: 80,
        right: 16,
        zIndex: 80,
        maxWidth: "calc(100vw - 32px)",
      }}
      className="card card-pad"
    >
      <summary
        onClick={() => {
          if (!items) load();
        }}
      >
        Notifications
      </summary>
      <div
        style={{
          width: 300,
          maxWidth: "100%",
          maxHeight: "50vh",
          overflowY: "auto",
        }}
      >
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={preference}
            disabled={busy}
            onChange={togglePreference}
          />
          Receive new in-app notifications
        </label>
        <p role="status">{error || (busy ? "Loading…" : "")}</p>
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={load}
        >
          Refresh
        </button>{" "}
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy || !items?.length}
          onClick={markRead}
        >
          Mark all read
        </button>
        {items?.length === 0 && <p>No notifications yet.</p>}
        {items?.map((n) => (
          <article key={n._id} className="mt-3">
            <strong>
              {n.readAt ? "" : "• "}
              {n.text}
            </strong>
            <p className="tiny muted">
              {new Date(n.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
      </div>
    </details>
  );
}
