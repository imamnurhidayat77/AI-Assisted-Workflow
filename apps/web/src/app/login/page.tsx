'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Icon, Input } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';

// Demo accounts per role — all passwords: sss12345 (override via DUMMY_PASSWORD on the API).
// id = sent to POST /api/auth/login as userId.
const DUMMY_ACCOUNTS = [
  { id: 'u-sales', name: 'Sophie Williams', role: 'sales', desc: 'Tenders & distributor sales' },
  { id: 'u-finance', name: 'James Patel', role: 'finance', desc: 'Invoices, accruals & closing' },
  { id: 'u-hr', name: 'Emily Zhang', role: 'hr', desc: 'Leave, policies & capacity' },
  { id: 'u-ops', name: 'Isaac Ngatai', role: 'operations', desc: 'Imports, documents & deadlines' },
  { id: 'u-mgmt', name: 'Thomas Bennett', role: 'management', desc: 'Cross-domain summary' },
];

const DUMMY_PASSWORD = 'sss12345';

export default function LoginPage() {
  const router = useRouter();
  const { user, users, ready, login } = useAuth();
  const { toast } = useToast();
  const [userId, setUserId] = useState('u-sales');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && user) router.replace('/');
  }, [ready, user, router]);

  // Prefill nama user dari /api/auth/users bila DB punya nama berbeda dari konstanta.
  const displayName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? DUMMY_ACCOUNTS.find((a) => a.id === id)?.name ?? id;

    const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userId.trim() || !password) {
      setError('Enter a user ID and password first.');
      return;
    }
    setBusy(true);
    setError('');
    const ok = await login(userId.trim(), password);
    setBusy(false);
    if (ok) {
      toast(`Signed in as ${displayName(userId.trim())}`);
      router.replace('/');
    } else {
      setError('Sign-in failed — check the user ID / password (dummy: sss12345). Make sure the API is running.');
    }
  };

  const quickLogin = async (id: string) => {
    setUserId(id);
    setBusy(true);
    setError('');
    const ok = await login(id, password || DUMMY_PASSWORD);
    setBusy(false);
    if (ok) {
      toast(`Signed in as ${displayName(id)}`);
      router.replace('/');
    } else {
      setPassword(DUMMY_PASSWORD);
      setError('Click once more to sign in, or type the password manually and press Sign in.');
    }
  };

  if (!ready) return <div className="login-wrap"><div className="login-card"><p className="login-muted">Loading session…</p></div></div>;

  return <div className="login-wrap">
    <div className="login-card">
      <div className="login-brand"><span className="brand-mark">S</span>
        <div><strong>Street Smart Cockpit</strong><small>AI BUSINESS OPERATIONS</small></div>
      </div>
      <h1 className="login-title">Sign in</h1>
      <p className="login-muted">Pick a demo account by role. All passwords: <code>sss12345</code></p>

      <form onSubmit={submit} className="login-form">
        <label className="login-label">User ID / name
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="u-sales / Sophie Williams" autoComplete="username" />
        </label>
        <label className="login-label">Password
          <div className="login-pw">
            <Input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="sss12345" autoComplete="current-password" />
            <button type="button" className="login-eye" onClick={() => setShowPw(!showPw)} title={showPw ? 'Sembunyikan' : 'Tampilkan'}>
              <Icon name="eye" size={16} />
            </button>
          </div>
        </label>
        {error && <div className="login-error"><Icon name="warning" size={14} />{error}</div>}
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</Button>
      </form>

      <div className="login-divider"><span>or quick sign-in by role</span></div>
      <div className="login-dummies">
        {DUMMY_ACCOUNTS.map((a) => (
            <button key={a.id} className={`login-dummy ${userId === a.id ? 'on' : ''}`} onClick={() => quickLogin(a.id)} disabled={busy} title={`Sign in as ${a.name}`}>
            <span className="login-avatar">{a.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
            <span className="login-dummy-text"><strong>{a.name}</strong><small>{a.role} · {a.desc}</small><code>{a.id} / sss12345</code></span>
          </button>
        ))}
      </div>
      <p className="login-foot">API: POST /api/auth/login {'{ userId, password }'} — needs the API running on :4000.</p>
    </div>
  </div>;
}
