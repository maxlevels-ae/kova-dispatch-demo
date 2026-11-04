"use client";
/* eslint-disable @next/next/no-img-element -- Validated inline logo previews cannot use image optimization. */
import { useEffect, useRef, useState } from "react";
import { useBranding } from "@/context/BrandingProvider";
import { DEFAULT_BRANDING, MAX_LOGO_BYTES } from "@/lib/branding";
import { KovaIcon } from "@/components/brand/KovaLogo";
import {
  SettingsSection,
  SettingsField,
  SettingsSaveBar,
  SettingsStatus,
  useSettingsDirty,
} from "./settings/SettingsUI";
export default function BrandingSettings({ onDirty, localization }) {
  const { setBranding } = useBranding();
  const [draft, setDraft] = useState(null),
    [saved, setSaved] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [errors, setErrors] = useState({});
  const lock = useRef(false);
  useEffect(() => {
    fetch("/api/branding", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error("Unable to load branding. Reload to retry.");
        const d = await r.json();
        setDraft(d);
        setSaved(d);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useSettingsDirty("branding", dirty, onDirty);
  async function choose(key, file) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > MAX_LOGO_BYTES
    ) {
      setErrors((e) => ({
        ...e,
        [key]: "Choose a PNG, JPEG or WebP image up to 256 KB.",
      }));
      return;
    }
    try {
      const value = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setDraft((d) => ({ ...d, [key]: value }));
      setErrors({});
    } catch {
      setErrors((e) => ({ ...e, [key]: "Could not read image." }));
    }
  }
  async function save(e) {
    e.preventDefault();
    if (lock.current || !dirty) return;
    if (
      !draft.name.trim() ||
      draft.name.trim().length > 60 ||
      /[\u0000-\u001f]/.test(draft.name)
    ) {
      setErrors({ name: "Enter 1–60 printable characters." });
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setBranding(d);
      setDraft(d);
      setSaved(d);
      setMessage("Branding saved.");
      setErrors({});
    } catch (e) {
      setMessage(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!draft) return <p role="status">{message || "Loading branding…"}</p>;
  return (
    <form onSubmit={save} noValidate>
      <p role="status" className="settings-feedback">
        {message}
      </p>
      <SettingsSection
        title="Company identity"
        description="The name customers and drivers see across Maxride."
      >
        <SettingsField
          id="brand-name"
          label="Company / brand display name"
          value={draft.name}
          maxLength={60}
          disabled={busy}
          error={errors.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
            setErrors({});
          }}
        />
      </SettingsSection>
      <SettingsSection
        title="Country and localization"
        description="Operating location is managed in Maps & Service Zones. Financial records retain their original currency."
      >
        <div className="settings-status-list">
          <div>
            <span>Operating location</span>
            <strong>
              {localization
                ? `${localization.city}, ${localization.country}`
                : "Loading location…"}
            </strong>
          </div>
          <div>
            <span>Timezone</span>
            <strong>Africa/Cairo</strong>
          </div>
          <div>
            <span>Platform currency</span>
            <SettingsStatus>EGP · Egyptian pound</SettingsStatus>
          </div>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Main logo and login logo"
        description="Static PNG, JPEG or WebP images, up to 256 KB each."
      >
        <div className="settings-logo-grid">
          {[
            ["logo", "Main company logo"],
            ["loginLogo", "Login-page logo (optional)"],
          ].map(([key, title]) => (
            <div key={key}>
              <h4>{title}</h4>
              <div className="settings-logo-preview">
                {draft[key] || (key === "loginLogo" && draft.logo) ? (
                  <img
                    src={draft[key] || draft.logo}
                    alt={`${title} preview`}
                  />
                ) : (
                  <KovaIcon size={48} />
                )}
              </div>
              <SettingsField
                label={`Upload ${title.toLowerCase()}`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                error={errors[key]}
                onChange={(e) => {
                  choose(key, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <p className="settings-hint">
                {draft[key]
                  ? "Custom image"
                  : key === "loginLogo"
                    ? "Uses the main company logo"
                    : "Original Maxride logo"}
              </p>
              {draft[key] && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => setDraft({ ...draft, [key]: null })}
                >
                  Remove uploaded logo
                </button>
              )}
            </div>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection
        title="Brand preview"
        description="Preview your company identity before saving."
      >
        <div className="settings-brand-preview">
          {draft.logo ? (
            <img src={draft.logo} alt="Brand preview" />
          ) : (
            <KovaIcon size={36} />
          )}
          <strong>{draft.name || "Your company"}</strong>
          <span>Workspace</span>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Restore default branding"
        description="Replace the name and both logos with the original Maxride identity. Save to apply."
        danger
      >
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => setDraft({ ...DEFAULT_BRANDING })}
        >
          Restore default branding
        </button>
      </SettingsSection>
      <SettingsSaveBar
        dirty={dirty}
        busy={busy}
        onDiscard={() => {
          setDraft(saved);
          setErrors({});
          setMessage("Changes discarded.");
        }}
      />
    </form>
  );
}
