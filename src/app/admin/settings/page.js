'use client';
/* eslint-disable @next/next/no-img-element -- Validated inline logo previews cannot use image optimization. */
import { useEffect, useState } from 'react';
import { useBranding } from '@/context/BrandingProvider';
import { DEFAULT_BRANDING, MAX_LOGO_BYTES } from '@/lib/branding';
import { KovaIcon } from '@/components/brand/KovaLogo';
import { useToast } from '@/components/ui/Toast';
export default function SettingsPage() {
  const { branding, setBranding } = useBranding();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const toast = useToast();
  useEffect(() => {
    fetch('/api/branding', { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error('Unable to load saved branding. Reload to try again.');
      setDraft(await r.json());
    }).catch(e => setLoadError(e.message));
  }, []);
  async function choose(key, file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_LOGO_BYTES) {
      toast('Choose a PNG, JPEG or WebP logo up to 256 KB.', 'error'); return;
    }
    try {
      const value = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      });
      setDraft(d => ({ ...d, [key]: value }));
    } catch { toast('Could not read this image.', 'error'); }
  }
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Unable to save branding');
      setBranding(data); setDraft(data); toast('Branding saved', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  if (!draft) return <div className="content-pad" role="status">{loadError || 'Loading settings…'}</div>;
  return <div className="content-pad" style={{ maxWidth: 900 }}>
    <h1 className="page-title">Settings</h1>
    <p className="page-sub mb-6">Manage the branding customers and drivers see across Maxride.</p>
    <form onSubmit={save} className="flex-col gap-4">
      <section className="card card-pad">
        <h2 className="mb-4">Brand identity</h2>
        <div className="field"><label htmlFor="brand-name">Company / brand display name</label><input id="brand-name" className="input" maxLength={60} required value={draft.name} disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
      </section>
      <div className="grid-2">
        {[['logo', 'Main company logo'], ['loginLogo', 'Login-page logo (optional)']].map(([key, title]) => <section key={key} className="card card-pad" style={{ minWidth: 0 }}>
          <h3>{title}</h3><p className="small muted mt-2">{draft[key] ? 'Custom logo' : key === 'loginLogo' ? 'Uses the main company logo' : 'Original default logo'}</p>
          <div className="flex items-center justify-center mt-4 mb-4" style={{ minHeight: 130, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12 }}>
            {draft[key] || (key === 'loginLogo' && draft.logo) ? <img src={draft[key] || draft.logo} alt={`${title} preview`} style={{ maxWidth: '100%', maxHeight: 110, objectFit: 'contain' }} /> : <KovaIcon size={64} />}
          </div>
          <label className="field">{draft[key] ? 'Replace logo' : 'Upload logo'}<input style={{ maxWidth: '100%' }} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { choose(key, e.target.files?.[0]); e.target.value = ''; }} /></label>
          <p className="tiny muted mt-2">PNG, JPEG or WebP · 256 KB maximum · static images only</p>
          {draft[key] && <button className="btn btn-secondary btn-sm mt-3" type="button" disabled={busy} onClick={() => setDraft({ ...draft, [key]: null })}>Remove uploaded logo</button>}
        </section>)}
      </div>
      <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setDraft(branding)}>Cancel</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setDraft({ ...DEFAULT_BRANDING })}>Restore default branding</button>
      </div>
    </form>
  </div>;
}
