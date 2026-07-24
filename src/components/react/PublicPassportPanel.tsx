/**
 * PublicPassportPanel — the "Your public passport" share controls on the
 * logged-in Puck Passport dashboard.
 *
 * Renders only when logged in (the parent gates on isLoggedIn). Owns:
 *   - the public URL  hockeygamebot.com/puck-passport/@{handle}
 *   - a Make-public toggle          → PUT /v1/account/public
 *   - a Copy-link button
 *   - a Customize-handle control     → live /handle-available + PUT /v1/account/handle
 *
 * When private the link is shown as "not live yet"; when public it is shown +
 * copyable. Handle/privacy changes are lifted to the parent so the rest of the
 * page (and this panel's URL) stay in sync.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { putAccountPublic, putHandle, checkHandleAvailable } from '../../lib/auth-client';

const PUBLIC_HOST = 'hockeygamebot.com';
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

type Props = {
  handle: string | null;
  isPublic: boolean;
  onHandleChange: (handle: string) => void;
  onPublicChange: (isPublic: boolean) => void;
};

export default function PublicPassportPanel({ handle, isPublic, onHandleChange, onPublicChange }: Props) {
  const publicUrl = handle ? `${PUBLIC_HOST}/puck-passport/@${handle}` : '';

  // ── Make-public toggle ────────────────────────────────────────────────────
  const [savingPublic, setSavingPublic] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  const togglePublic = useCallback(async () => {
    if (savingPublic) return;
    const next = !isPublic;
    setSavingPublic(true);
    setPublicError(null);
    const res = await putAccountPublic(next);
    setSavingPublic(false);
    if (res === null) {
      setPublicError('Could not update — try again.');
      return;
    }
    onPublicChange(res);
  }, [isPublic, savingPublic, onPublicChange]);

  // ── Copy link ─────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const copyLink = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(`https://${publicUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [publicUrl]);

  // ── Customize handle ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [avail, setAvail] = useState<{ state: 'idle' | 'checking' | 'ok' | 'bad'; msg: string }>({
    state: 'idle',
    msg: '',
  });
  const [saving, setSaving] = useState(false);
  const availSeq = useRef(0);

  const openEditor = useCallback(() => {
    setDraft(handle ?? '');
    setAvail({ state: 'idle', msg: '' });
    setEditing(true);
  }, [handle]);

  // Debounced live availability check as the user types.
  useEffect(() => {
    if (!editing) return;
    const value = draft.trim().toLowerCase();
    if (value === '' || value === (handle ?? '')) {
      setAvail({ state: 'idle', msg: '' });
      return;
    }
    if (!HANDLE_RE.test(value)) {
      setAvail({ state: 'bad', msg: '3–20 chars: lowercase letters, numbers, underscore.' });
      return;
    }
    const seq = ++availSeq.current;
    setAvail({ state: 'checking', msg: 'Checking…' });
    const t = setTimeout(async () => {
      const res = await checkHandleAvailable(value);
      if (seq !== availSeq.current) return; // superseded by a newer keystroke
      if (res === null) {
        setAvail({ state: 'bad', msg: 'Could not check availability — try again.' });
      } else if (res.available) {
        setAvail({ state: 'ok', msg: 'Available' });
      } else if (res.reason === 'reserved') {
        setAvail({ state: 'bad', msg: 'That handle is reserved.' });
      } else if (res.reason === 'format') {
        setAvail({ state: 'bad', msg: '3–20 chars: lowercase letters, numbers, underscore.' });
      } else {
        setAvail({ state: 'bad', msg: 'Taken — pick another.' });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [draft, editing, handle]);

  const submitHandle = useCallback(async () => {
    const value = draft.trim().toLowerCase();
    if (saving || value === '' || value === (handle ?? '')) return;
    setSaving(true);
    const res = await putHandle(value);
    setSaving(false);
    if (res.ok && res.handle) {
      onHandleChange(res.handle);
      setEditing(false);
      setAvail({ state: 'idle', msg: '' });
      return;
    }
    // Surface 409 taken / 400 bad-format-or-reserved inline.
    setAvail({
      state: 'bad',
      msg:
        res.status === 409
          ? 'Taken — pick another.'
          : res.status === 400
            ? res.error || 'Invalid handle.'
            : res.error || 'Could not update handle.',
    });
  }, [draft, handle, saving, onHandleChange]);

  const canSubmit =
    avail.state === 'ok' && !saving && draft.trim().toLowerCase() !== (handle ?? '');

  return (
    <section className="pp-panel">
      <div className="pp-panel-head">
        <span className="pp-panel-label">Your public passport</span>
        <span className={isPublic ? 'pp-panel-status on' : 'pp-panel-status'}>
          {isPublic ? 'Public' : 'Private'}
        </span>
      </div>

      {/* URL + copy */}
      <div className="pp-url-row">
        <span className={isPublic ? 'pp-url' : 'pp-url pp-url-private'}>
          {handle ? publicUrl : 'Set a handle below to get your public link.'}
        </span>
        {isPublic && handle ? (
          <button className="att-btn-ghost" onClick={copyLink}>
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        ) : null}
      </div>
      {!isPublic ? (
        <div className="pp-note">Private — make public to share your link.</div>
      ) : null}

      {/* Make public toggle */}
      <div className="pp-actions">
        <label className="pp-toggle">
          <input type="checkbox" checked={isPublic} disabled={savingPublic} onChange={togglePublic} />
          <span className={isPublic ? 'pp-toggle-track on' : 'pp-toggle-track'}>
            <span className="pp-toggle-knob" />
          </span>
          <span className="pp-toggle-label">{isPublic ? 'Public — anyone with the link' : 'Make public'}</span>
        </label>
      </div>
      {publicError ? <div className="pp-note err">{publicError}</div> : null}

      {/* Customize handle */}
      <div className="pp-customize">
        {!editing ? (
          <button className="pp-customize-toggle" onClick={openEditor}>
            Customize handle
          </button>
        ) : (
          <div className="pp-handle-form">
            <div className="pp-handle-input-row">
              <span className="pp-handle-at">@</span>
              <input
                className="pp-handle-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitHandle();
                }}
                placeholder="your_handle"
                maxLength={20}
                autoFocus
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <button className="att-btn att-btn-sm" onClick={submitHandle} disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                className="att-btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setAvail({ state: 'idle', msg: '' });
                }}
              >
                Cancel
              </button>
            </div>
            {avail.msg ? (
              <div className={avail.state === 'ok' ? 'pp-note ok' : avail.state === 'bad' ? 'pp-note err' : 'pp-note'}>
                {avail.msg}
              </div>
            ) : (
              <div className="pp-note">3–20 chars: lowercase letters, numbers, underscore.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
