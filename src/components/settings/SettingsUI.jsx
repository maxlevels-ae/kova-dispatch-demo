"use client";
import { useEffect, useId } from "react";
import { Check, Circle, SlidersHorizontal } from "lucide-react";
export function SettingsLayout({ navigation, children }) {
  return (
    <div className="settings-shell">
      <header className="settings-title">
        <span className="settings-eyebrow">WORKSPACE</span>
        <h1>Settings</h1>
        <p>Make Maxride work for your business.</p>
      </header>
      <div className="settings-layout">
        {navigation}
        <div className="settings-content">{children}</div>
      </div>
    </div>
  );
}
export function SettingsNavigation({ groups, active, onChange, dirty = {} }) {
  return (
    <>
      <div className="settings-mobile-nav">
        <label htmlFor="settings-section">Settings section</label>
        <select
          id="settings-section"
          className="input"
          value={active}
          onChange={(e) => onChange(e.target.value)}
        >
          {groups.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                  {dirty[i.id] ? " • Unsaved" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <nav className="settings-nav" aria-label="Settings sections">
        {groups.map((g) => (
          <div className="settings-nav-group" key={g.name}>
            <h2>{g.name}</h2>
            {g.items.map((i) => (
              <button
                type="button"
                key={i.id}
                aria-current={active === i.id ? "page" : undefined}
                onClick={() => onChange(i.id)}
              >
                <i.icon size={17} />
                <span>{i.title}</span>
                {dirty[i.id] && (
                  <Circle
                    size={7}
                    fill="currentColor"
                    aria-label="Unsaved changes"
                  />
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}
export function SettingsPageHeader({ title, description }) {
  return (
    <header className="settings-page-header">
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}
export function SettingsSection({
  title,
  description,
  children,
  danger = false,
}) {
  return (
    <section className={`settings-section${danger ? " settings-danger" : ""}`}>
      <div className="settings-section-heading">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}
export function SettingsField({ label, hint, error, children, ...props }) {
  const uid = useId();
  const id = props.id || uid;
  return (
    <div className="settings-field">
      <label htmlFor={id}>{label}</label>
      {children || (
        <input
          className="input"
          {...props}
          id={id}
          aria-invalid={!!error}
          aria-describedby={hint || error ? `${id}-help` : undefined}
        />
      )}
      {(hint || error) && (
        <p
          id={`${id}-help`}
          className={error ? "settings-error" : "settings-hint"}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
export function SettingsSelect({ label, options, ...props }) {
  const id = useId();
  return (
    <div className="settings-field">
      <label htmlFor={id}>{label}</label>
      <select className="input" id={id} {...props}>
        {options.map((o) => (
          <option
            key={typeof o === "string" ? o : o.value}
            value={typeof o === "string" ? o : o.value}
          >
            {typeof o === "string" ? o : o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function SettingsToggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="settings-toggle-row">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}
export function SettingsCheckboxGroup({
  label,
  options,
  value,
  onChange,
  disabled,
  error,
}) {
  return (
    <fieldset className="settings-check-group">
      <legend>{label}</legend>
      <div>
        {options.map((o) => (
          <label key={o}>
            <input
              type="checkbox"
              checked={value.includes(o)}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, o]
                    : value.filter((v) => v !== o),
                )
              }
            />
            <span>{o.replaceAll("_", " ")}</span>
          </label>
        ))}
      </div>
      {error && <p className="settings-error">{error}</p>}
    </fieldset>
  );
}
export function SettingsStatus({ children }) {
  return (
    <span className="settings-status">
      <span />
      {children}
    </span>
  );
}
export function SettingsSaveBar({ dirty, busy, onDiscard }) {
  if (!dirty) return null;
  return (
    <div className="settings-savebar">
      <span>
        <Circle size={8} fill="currentColor" /> Unsaved changes
      </span>
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={onDiscard}
        >
          Discard
        </button>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={!dirty || busy}
        >
          <Check size={16} />
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
export function SettingsEmptyState({ title, children }) {
  return (
    <div className="settings-empty">
      <SlidersHorizontal size={21} />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
export function useSettingsDirty(id, dirty, onDirty) {
  useEffect(() => {
    onDirty?.(id, dirty);
  }, [id, dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
