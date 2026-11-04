"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
export function useSettingsFeedback(scope) {
  const toast = useToast();
  const [savedTimes, setSavedTimes] = useState({});
  function confirm() {
    const time = new Date().toISOString();
    setSavedTimes((s) => ({ ...s, [scope]: time }));
    toast(
      "Settings saved successfully · تم حفظ الإعدادات بنجاح",
      "success",
      5000,
    );
  }
  return { confirm, savedAt: savedTimes[scope] };
}
export function SettingsSaveConfirmation({ savedAt, dirty, busy, message }) {
  if (!savedAt || dirty || busy || message) return null;
  return (
    <div
      className="settings-save-confirmation"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <CheckCircle2 size={21} />
      <div>
        <strong>Settings saved successfully</strong>
        <span lang="ar" dir="rtl">
          تم حفظ الإعدادات بنجاح
        </span>
        <small>
          Saved · Last saved at{" "}
          <time dateTime={savedAt}>
            {new Date(savedAt).toLocaleTimeString()}
          </time>
        </small>
      </div>
    </div>
  );
}
