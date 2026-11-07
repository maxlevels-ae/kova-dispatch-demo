import Link from 'next/link';
import { ShieldCheck, Car, User, ArrowRight } from 'lucide-react';

const DEMOS = [
  { key: 'admin', icon: ShieldCheck, role: 'Admin', username: 'admin', text: 'Manage drivers, pricing, deliveries, wallets and live maps from the control panel.' },
  { key: 'driver1', icon: Car, role: 'Captain', username: 'driver1', text: 'Go online, receive ride and delivery offers, and track your earnings.' },
  { key: 'rider1', icon: User, role: 'Client', username: 'rider1', text: 'Book a taxi or send a parcel, follow it live and pay from your wallet.' },
];

export default function DemoSection() {
  return (
    <section style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '72px 24px' }}>
        <span className="eyebrow">Live demo</span>
        <h2 style={{ fontSize: '2rem', marginTop: 10, maxWidth: 520 }}>Try Maxride as admin, captain or client</h2>
        <div className="grid-3 mt-8">
          {DEMOS.map(({ key, icon: Icon, role, username, text }) => (
            <div key={key} className="card card-pad" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
              <span className="avatar" style={{ background: 'var(--gold-50)', color: 'var(--gold-700)', borderRadius: 12 }}>
                <Icon size={19} />
              </span>
              <h3 style={{ fontSize: '1.1rem', marginTop: 14 }}>{role}</h3>
              <p className="small muted mt-1" style={{ lineHeight: 1.6, flex: 1 }}>{text}</p>
              <div className="small mono-nums" style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--ink-100)' }}>
                <div>Username: <b>{username}</b></div>
                <div>Password: <b>kovademo1</b></div>
              </div>
              <Link href={`/login?demo=${key}`} className="btn btn-primary mt-4">
                Open {role.toLowerCase()} demo <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
