"use client";
import { useState, useRef } from "react";
import { Bell, X } from "lucide-react";
import { useSession } from "next-auth/react";
export default function NotificationInbox() {
  const { data: session } = useSession();
  const detailsRef=useRef(null);
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
    <details ref={detailsRef} className="notification-inbox" onKeyDown={e=>{if(e.key==='Escape'){detailsRef.current.open=false;detailsRef.current.querySelector('summary').focus();}}}>
      <summary className="btn btn-ghost notification-trigger" aria-label="Notifications"
        onClick={() => {
          if (!items) load();
        }}
      >
        <Bell size={18} aria-hidden="true"/><span>Notifications</span>
      </summary>
      <div className="notification-panel card" role="region" aria-label="Notification inbox">
        <div className="flex justify-between items-center mb-3"><strong>Notifications</strong><button className="btn btn-ghost btn-icon" aria-label="Close notifications" onClick={()=>{detailsRef.current.open=false;detailsRef.current.querySelector('summary').focus();}}><X size={16}/></button></div>
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
