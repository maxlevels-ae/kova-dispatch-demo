"use client";
import {
  useSettingsFeedback,
  SettingsSaveConfirmation,
} from "./SettingsFeedback";
import MapsFields from "./MapsFields";
import NotificationControls from '@/components/NotificationControls';
import { useRef, useState } from "react";
import { categories, events, schemas } from "@/lib/settings-schema";
import {
  SettingsSection,
  SettingsField,
  SettingsSelect,
  SettingsToggle,
  SettingsCheckboxGroup,
  SettingsSaveBar,
  SettingsStatus,
  SettingsEmptyState,
  useSettingsDirty,
} from "./SettingsUI";
const human = (s) => s.replaceAll("_", " ");
// Deliberately curated form sections; persistence keys do not determine the UI.
const forms = {
  dispatch: [
    [
      "Dispatch strategy",
      "Automatic offers or an administrator-led dispatch workflow.",
      [
        [
          "assignmentMode",
          "Assignment mode",
          "select",
          [
            { value: "automatic", label: "Automatic driver offers" },
            { value: "manual", label: "Manual admin dispatch" },
          ],
        ],
      ],
    ],
    [
      "Driver matching rules",
      "Drivers must accept offers before they are assigned.",
      [
        ["searchRadiusKm", "Driver search radius (km)", "number", 0.5, 50],
        ["acceptanceSeconds", "Acceptance timeout (seconds)", "number", 5, 25],
        ["maxAttempts", "Maximum assignment attempts", "number", 1, 8],
        ["maxTripKm", "Maximum trip distance (km)", "number", 1, 200],
      ],
    ],
    [
      "Booking schedules",
      "One active booking per rider. Scheduled requests dispatch after their requested time.",
      [
        ["scheduledEnabled", "Allow scheduled bookings", "toggle"],
        ["maxScheduleDays", "Maximum days in advance", "number", 1, 30],
      ],
    ],
    [
      "Service hours",
      "All hours use Africa/Cairo. Use 0–24 for round-the-clock service.",
      [
        [
          "serviceStartHour",
          "Service start hour (Africa/Cairo)",
          "number",
          0,
          23,
        ],
        ["serviceEndHour", "Service end hour (Africa/Cairo)", "number", 1, 24],
      ],
    ],
    [
      "Cancellation and fallback policies",
      "Late cancellation fees are managed in Pricing & Commission. Active trips retain their settlement rules.",
      [
        [
          "fallback",
          "When no driver accepts",
          "select",
          [
            { value: "no_drivers", label: "Mark as no drivers available" },
            { value: "manual", label: "Hold for manual dispatch" },
          ],
        ],
      ],
    ],
  ],
  fleet: [
    [
      "Driver onboarding and approval",
      "Administrator approval is mandatory before a driver can go online.",
      [],
    ],
    [
      "Required documents",
      "Selected documents must be verified for driver eligibility.",
      [
        [
          "requiredDocuments",
          "Required verified documents",
          "checks",
          [
            "license",
            "insurance",
            "registration",
            "background_check",
            "profile_photo",
          ],
        ],
      ],
    ],
    [
      "Vehicle categories",
      "Choose the services riders can book. Keep at least one category enabled.",
      [
        [
          "enabledCategories",
          "Enabled vehicle categories",
          "checks",
          categories,
        ],
      ],
    ],
    [
      "Operational restrictions",
      "Suspension prevents new availability; active trips retain their settlement path.",
      [
        [
          "maxDailyTrips",
          "Maximum trips in 24 hours (0 = unlimited)",
          "number",
          0,
          100,
        ],
        ["maxDebtEGP", "Maximum driver debt (EGP)", "number", 0, 25],
        ["suspensionReasonRequired", "Require a suspension reason", "toggle"],
      ],
    ],
  ],
  security: [
    [
      "Access control",
      "Only active administrators can manage settings. Roles are rechecked for every privileged API request.",
      [],
    ],
    [
      "Session settings",
      "Changes apply to new logins. Existing sessions keep their original lifetime.",
      [
        [
          "sessionHours",
          "Session duration for new logins (hours)",
          "number",
          1,
          720,
        ],
      ],
    ],
    [
      "Security policies",
      "Authenticated, same-origin requests are required for changes. Concurrent operational edits are protected by revision checks.",
      [],
    ],
  ],
  notifications: [
    [
      "In-app notifications",
      "Ride updates are delivered to the inbox by the background worker and reconciled on refresh.",
      [],
    ],
    [
      "Event triggers",
      "Select which operational events create in-app notifications.",
      [["enabledEvents", "Enabled notification events", "checks", events]],
    ],
  ],
};
export default function PlatformForm({
  id,
  initial,
  records,
  onSaved,
  onDirty,
  monitoring,
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const feedback = useSettingsFeedback(id);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useSettingsDirty(id, dirty, onDirty);
  const change = (key, v) => {
    setValue((d) => ({
      ...d,
      ...(typeof key === "object" ? key : { [key]: v }),
    }));
    setErrors({});
    setMessage("");
  };
  async function save(e) {
    e.preventDefault();
    if (lock.current || !dirty) return;
    const parsed = schemas[id].safeParse(value);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [
            i.path.join(".") || "_form",
            i.message,
          ]),
        ),
      );
      setMessage("Review the highlighted fields.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/settings/platform", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: id,
          value: parsed.data,
          revision: records.find((r) => r._id === id)?.revision || 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSaved(parsed.data);
      setValue(parsed.data);
      onSaved(id, d.revision);
      if (id === "maps") window.dispatchEvent(new Event("maxride:maps-saved"));
      setMessage("");
      feedback.confirm();
    } catch (e) {
      setMessage(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} noValidate>
      <SettingsSaveConfirmation
        savedAt={feedback.savedAt}
        dirty={dirty}
        busy={busy}
        message={message}
      />
      <div role="status" className="settings-feedback">
        {message}
      </div>
      {errors._form && (
        <p role="alert" className="settings-error">
          {errors._form}
        </p>
      )}
      {id === "maps" && (
        <MapsFields
          value={value}
          onChange={change}
          busy={busy}
          errors={errors}
        />
      )}
      {(id === "maps" ? [] : forms[id]).map(([title, description, fields]) => (
        <SettingsSection key={title} title={title} description={description}>
          <div className="settings-fields">
            {fields.map(([key, label, type, options, max]) =>
              type === "toggle" ? (
                <SettingsToggle
                  key={key}
                  label={label}
                  checked={value[key]}
                  disabled={busy}
                  onChange={(v) => change(key, v)}
                />
              ) : type === "checks" ? (
                <SettingsCheckboxGroup
                  key={key}
                  label={label}
                  options={options}
                  value={value[key]}
                  disabled={busy}
                  error={errors[key]}
                  onChange={(v) => change(key, v)}
                />
              ) : type === "select" ? (
                <SettingsSelect
                  key={key}
                  label={label}
                  options={options}
                  value={value[key]}
                  disabled={busy}
                  onChange={(e) => change(key, e.target.value)}
                />
              ) : (
                <SettingsField
                  key={key}
                  id={key}
                  label={label}
                  type={type}
                  min={type === "number" ? options : undefined}
                  max={max}
                  maxLength={type === "text" ? 80 : undefined}
                  step="any"
                  required
                  value={value[key]}
                  disabled={busy}
                  error={errors[key]}
                  onChange={(e) =>
                    change(
                      key,
                      type === "number" && e.target.value !== ""
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              ),
            )}
          </div>
          {!fields.length && (
            <SettingsStatus>Enforced by platform</SettingsStatus>
          )}
        </SettingsSection>
      ))}
      {id === "notifications" && (
        <>
          <SettingsSection title="Sound and browser alerts" description="Global sound switches apply to all users. Browser permission and subscriptions apply to this signed-in browser.">
            <SettingsToggle label="Driver new booking sound" checked={value.driverSound} onChange={v=>change('driverSound',v)} disabled={busy}/>
            <SettingsToggle label="Rider trip sound" checked={value.riderSound} onChange={v=>change('riderSound',v)} disabled={busy}/>
            <SettingsToggle label="Message sounds" checked={value.messageSound} onChange={v=>change('messageSound',v)} disabled={busy}/>
            <NotificationControls/>
          </SettingsSection>
          <SettingsSection
            title="Delivery channels"
            description="External delivery requires a verified integration."
          >
            <div className="settings-status-list">
              {["In-app inbox", "Email", "SMS", "WhatsApp", "Push"].map(
                (c, i) => (
                  <div key={c}>
                    <strong>{c}</strong>
                    <SettingsStatus>
                      {i === 0 ? "Configured" : c==='Push'?(monitoring?.providers?.push||'Checking configuration') : "Not configured"}
                    </SettingsStatus>
                  </div>
                ),
              )}
            </div>
          </SettingsSection>
          <SettingsSection
            title="Notification templates"
            description="Plain text, up to 300 characters per event."
          >
            <div className="settings-fields">
              {events.map((event) => (
                <SettingsField
                  key={event}
                  label={human(event)}
                  value={value.templates[event]}
                  maxLength={300}
                  disabled={busy}
                  error={errors[`templates.${event}`]}
                  onChange={(e) =>
                    change("templates", {
                      ...value.templates,
                      [event]: e.target.value,
                    })
                  }
                />
              ))}
            </div>
          </SettingsSection>
          <SettingsSection title="Delivery history and errors">
            <DeliveryHistory monitoring={monitoring} />
            {monitoring?.notifications?.pushDeliveries?.map(n=><p className="small" key={n._id}>{human(n.event)} · Push: {n.pushStatus}{n.pushError?' — '+n.pushError:''}</p>)}
          </SettingsSection>
        </>
      )}
      {id === "security" && (
        <SettingsSection
          title="Audit history"
          description="Recent changes to operational settings."
        >
          {records.some((r) => r.history?.length) ? (
            records.map((r) => (
              <div key={r._id} className="settings-audit">
                <strong>
                  {r._id} · Revision {r.revision}
                </strong>
                {r.history
                  ?.slice(-5)
                  .reverse()
                  .map((h, i) => (
                    <p key={i}>
                      {new Date(h.at).toLocaleString()} · {h.fields.join(", ")}{" "}
                      · Actor {h.actor}
                    </p>
                  ))}
              </div>
            ))
          ) : (
            <SettingsEmptyState title="No changes recorded">
              Saved changes will appear here.
            </SettingsEmptyState>
          )}
        </SettingsSection>
      )}
      <SettingsSaveBar
        dirty={dirty}
        busy={busy}
        onDiscard={() => {
          setValue(saved);
          setErrors({});
          setMessage("Changes discarded.");
        }}
      />
    </form>
  );
}
function DeliveryHistory({ monitoring }) {
  if (!monitoring)
    return (
      <SettingsEmptyState title="History unavailable">
        Open System & Monitoring to refresh operational data.
      </SettingsEmptyState>
    );
  const rows = monitoring.notifications.deliveries;
  return rows.length ? (
    <div className="settings-status-list">
      {rows.map((r) => (
        <div key={r._id}>
          <span>
            <strong>{human(r.event)}</strong>
            <small>
              {new Date(r.updatedAt).toLocaleString()} · {r.attempts} attempts
              {r.lastError ? ` · ${r.lastError}` : ""}
            </small>
          </span>
          <SettingsStatus>{r.status}</SettingsStatus>
        </div>
      ))}
    </div>
  ) : (
    <SettingsEmptyState title="No deliveries yet">
      Delivery attempts and errors will appear here.
    </SettingsEmptyState>
  );
}
