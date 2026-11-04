"use client";
import {
  useSettingsFeedback,
  SettingsSaveConfirmation,
} from "./SettingsFeedback";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_PRICING } from "@/lib/currency";
import {
  SettingsSection,
  SettingsField,
  SettingsSelect,
  SettingsStatus,
  SettingsSaveBar,
  useSettingsDirty,
} from "./SettingsUI";
const groups = [
  [
    "Fare structure",
    "All amounts are in Egyptian pounds.",
    [
      ["baseFare", "Base fare (EGP)", 0, 10000],
      ["perKmRate", "Per kilometer (EGP)", 0, 1000],
      ["perMinRate", "Per minute (EGP)", 0, 1000],
      ["minimumFare", "Minimum fare (EGP)", 0, 10000],
      ["bookingFee", "Booking fee (EGP)", 0, 1000],
    ],
  ],
  [
    "Surge settings",
    "Limit the maximum demand multiplier.",
    [["surgeMultiplierCap", "Surge multiplier cap", 1, 10]],
  ],
  [
    "Commissions",
    "The platform share of each fare.",
    [["platformCommission", "Platform commission (%)", 0, 50]],
  ],
  [
    "Cancellation fees",
    "Late cancellation fees apply to new rides. Existing rides retain their snapshotted rules.",
    [["cancellationFee", "Late cancellation fee (EGP)", 0, 1000]],
  ],
];
const names = {
  economy: "Economy",
  comfort: "Comfort",
  premium: "Premium",
  xl: "XL",
};
export default function PricingSettings({ onDirty }) {
  const [rules, setRules] = useState(null),
    [saved, setSaved] = useState(null),
    [tier, setTier] = useState("economy"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [errors, setErrors] = useState({});
  const lock = useRef(false);
  useEffect(() => {
    fetch("/api/admin/pricing")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        const merged = Object.fromEntries(
          Object.keys(DEFAULT_PRICING).map((t) => [
            t,
            {
              cancellationFee: 30,
              ...DEFAULT_PRICING[t],
              ...d.rules.find(
                (r) =>
                  r.vehicleType === t &&
                  r.city === "default" &&
                  r.currency === "EGP",
              ),
            },
          ]),
        );
        setRules(merged);
        setSaved(merged);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const feedback = useSettingsFeedback(tier);
  const changed = (t) =>
    rules && JSON.stringify(rules[t]) !== JSON.stringify(saved[t]);
  useSettingsDirty(
    "pricing",
    rules ? Object.keys(rules).some(changed) : false,
    onDirty,
  );
  async function save(e) {
    e.preventDefault();
    if (lock.current || !changed(tier)) return;
    const payload = {
      vehicleType: tier,
      city: "default",
      isActive: rules[tier].isActive ?? true,
    };
    const issues = {};
    for (const [, , fields] of groups)
      for (const [key, , min, max] of fields) {
        const n = Number(rules[tier][key]);
        if (
          rules[tier][key] === "" ||
          !Number.isFinite(n) ||
          n < min ||
          n > max
        )
          issues[key] = `Enter a value from ${min} to ${max}.`;
        payload[key] = n;
      }
    setErrors(issues);
    if (Object.keys(issues).length) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRules((rs) => ({ ...rs, [tier]: d.rule }));
      setSaved((rs) => ({ ...rs, [tier]: d.rule }));
      setMessage("");
      feedback.confirm();
    } catch (e) {
      setMessage(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!rules) return <p role="status">{message || "Loading pricing…"}</p>;
  return (
    <form onSubmit={save} noValidate>
      <SettingsSaveConfirmation
        savedAt={feedback.savedAt}
        dirty={changed(tier)}
        busy={busy}
        message={message}
      />
      <p role="status" className="settings-feedback">
        {message}
      </p>
      <SettingsSection
        title="Service tiers"
        description="Edit one tier at a time. Drafts are retained when switching tiers."
      >
        <SettingsSelect
          label="Service tier"
          value={tier}
          disabled={busy}
          onChange={(e) => {
            setTier(e.target.value);
            setErrors({});
            setMessage("");
          }}
          options={Object.keys(names).map((value) => ({
            value,
            label: names[value] + (changed(value) ? " · Unsaved" : ""),
          }))}
        />
        <SettingsStatus>EGP · Legacy currencies preserved</SettingsStatus>
      </SettingsSection>
      {groups.map(([title, description, fields]) => (
        <SettingsSection key={title} title={title} description={description}>
          <div className="settings-fields">
            {fields.map(([key, label, min, max]) => (
              <SettingsField
                key={key}
                label={label}
                type="number"
                min={min}
                max={max}
                step="any"
                value={rules[tier][key]}
                error={errors[key]}
                disabled={busy}
                onChange={(e) => {
                  setRules((rs) => ({
                    ...rs,
                    [tier]: { ...rs[tier], [key]: e.target.value },
                  }));
                  setErrors({});
                }}
              />
            ))}
          </div>
        </SettingsSection>
      ))}
      <SettingsSaveBar
        dirty={changed(tier)}
        busy={busy}
        onDiscard={() => {
          setRules((rs) => ({ ...rs, [tier]: saved[tier] }));
          setErrors({});
          setMessage("Changes discarded.");
        }}
      />
    </form>
  );
}
