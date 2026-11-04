'use client';
import {t as tr,customerLocale} from '@/lib/i18n';
import {useI18n} from '@/context/LanguageProvider';

import { useEffect, useRef, useState } from 'react';
import { Send, X, MessageCircle } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

/**
 * In-ride chat panel. Messages arrive via the socket (parent owns the
 * list); sending goes through the REST API so it's persisted.
 */
export default function ChatSheet({ rideId, role, messages, open, onClose, counterpartName }) {
  useI18n();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const toast = useToast();
  const pendingId=useRef(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function send(e) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    pendingId.current ||= crypto.randomUUID();
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed,clientId:pendingId.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || 'Message failed to send', 'error');
      } else {
        setText('');
        pendingId.current=null;
      }
    } catch {
      toast('Message failed to send', 'error');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="card animate-in"
      style={{
        position: 'absolute',
        bottom: 16,
        insetInlineEnd: 16,
        width: 'min(360px, calc(100% - 32px))',
        height: 420,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 25,
        overflow: 'hidden',
      }}
      role="dialog"
      aria-label={tr("Chat")}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={17} style={{ color: 'var(--gold-600)' }} />
          <span className="small" style={{ fontWeight: 700 }}>
            {tr(counterpartName || 'Chat')}
          </span>
        </div>
        <button className="btn btn-ghost btn-icon" style={{ minHeight: 32, width: 32 }} onClick={onClose} aria-label={tr("Close chat")}>
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1" style={{ overflowY: 'auto', padding: 14 }}>
        {messages.length === 0 && (
          <p className="tiny muted text-center" style={{ paddingTop: 40 }}>{tr("Say hi — messages stay in this trip.")}</p>
        )}
        <div className="flex-col gap-2">
          {messages.map((m, i) => {
            const mine = m.from === role;
            return (
              <div
                key={m._id||m.id||i}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '8px 13px',
                  borderRadius: 16,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius: mine ? 16 : 4,
                  background: mine ? 'var(--ink-950)' : 'var(--ink-100)',
                  color: mine ? 'var(--text-invert)' : 'var(--text)',
                  fontSize: '0.88rem',
                }}
              >
                {m.text}
                <small style={{display:'block',opacity:.7,fontSize:10}}>{tr(new Date(m.at).toLocaleTimeString(customerLocale(),{hour:'2-digit',minute:'2-digit'}))}</small>
              </div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={send}
        className="flex gap-2"
        style={{ padding: 12, borderTop: '1px solid var(--border)' }}
      >
        <input
          className="input flex-1"
          style={{ minHeight: 42 }}
          value={text}
          onChange={(e) => {pendingId.current=null;setText(e.target.value);}}
          placeholder={tr("Type a message…")}
          maxLength={500}
          aria-label={tr("Message")}
        />
        <button
          type="submit"
          className="btn btn-primary btn-icon"
          disabled={!text.trim() || sending}
          aria-label={tr("Send message")}
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
