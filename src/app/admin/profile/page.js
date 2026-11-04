"use client";
import { useEffect, useState, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";
import { api, Field, ProfileFields } from "@/components/admin/Accounts";
import { Avatar, Loading } from "@/components/ui/bits";
import { useToast } from "@/components/ui/Toast";
export default function Profile() {
  const [value, setValue] = useState(null),
    [saved, setSaved] = useState(null),
    [avatar, setAvatar] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [password, setPassword] = useState({
      currentPassword: "",
      newPassword: "",
      confirmation: "",
    }),
    [changed, setChanged] = useState(false);
  const toast = useToast(),
    lock = useRef(false),
    { update } = useSession();
  useEffect(() => {
    api("/api/admin/profile")
      .then(({ user }) => {
        const v = {
          name: user.name,
          username: user.username,
          email: user.email || "",
          phone: user.phone || "",
        };
        setValue(v);
        setSaved(v);
        setAvatar(user.avatar || "");
      })
      .catch((e) => setError(e.message));
  }, []);
  async function run(fn, message) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(message);
      toast(message, "success");
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!value)
    return (
      <div className="content-pad">
        {error ? <p role="alert">{error}</p> : <Loading />}
      </div>
    );
  return (
    <div className="content-pad account-page">
      <header className="account-heading">
        <div>
          <h1 className="page-title">My profile</h1>
          <p className="page-sub">
            Your administrator identity and account security
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </button>
      </header>
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
      {changed ? (
        <section className="card account-section">
          <h2>Password changed successfully</h2>
          <p>
            All existing sessions have been invalidated. Sign in with your new
            password.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign in again
          </button>
        </section>
      ) : (
        <>
          <section className="card account-section">
            <h2>Profile photo</h2>
            <div className="flex items-center gap-3 wrap">
              <Avatar name={value.name} src={avatar} size="lg" />
              <Field label="Upload photo">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    run(async () => {
                      const form = new FormData();
                      form.set("file", file);
                      const r = await fetch("/api/users/me/avatar", {
                        method: "POST",
                        body: form,
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error);
                      setAvatar(d.avatar);
                      await update({ avatar: d.avatar });
                    }, "Profile photo saved successfully");
                  }}
                />
              </Field>
            </div>
          </section>
          <form
            className="card account-section"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/api/admin/profile", "PATCH", value);
                setSaved(value);
                await update({ name: value.name });
              }, "Profile saved successfully");
            }}
          >
            <h2>Personal information</h2>
            <ProfileFields value={value} onChange={setValue} />
            <div className="account-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setValue(saved)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={
                  busy || JSON.stringify(value) === JSON.stringify(saved)
                }
              >
                Save profile
              </button>
            </div>
          </form>
          <form
            className="card account-section"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/api/admin/profile", "POST", password);
                setPassword({
                  currentPassword: "",
                  newPassword: "",
                  confirmation: "",
                });
                setChanged(true);
              }, "Password changed successfully");
            }}
          >
            <h2>Change password</h2>
            <p className="muted">
              Use at least 12 characters. Changing your password signs out all
              existing sessions.
            </p>
            <div className="account-grid">
              {[
                ["currentPassword", "Current password"],
                ["newPassword", "New password"],
                ["confirmation", "Confirm new password"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    className="input"
                    required
                    type="password"
                    autoComplete={
                      key === "currentPassword"
                        ? "current-password"
                        : "new-password"
                    }
                    minLength={key === "currentPassword" ? 1 : 12}
                    maxLength={72}
                    value={password[key]}
                    onChange={(e) =>
                      setPassword({ ...password, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <button className="btn btn-primary" disabled={busy}>
              Change password
            </button>
          </form>
        </>
      )}
    </div>
  );
}
