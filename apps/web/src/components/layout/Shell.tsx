'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Icon, Input, type IconName } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import type { RoleId } from '@street-smart/shared';

export type NavItem = { href: string; label: string; icon: IconName; roles?: RoleId[] };

export const navGroups: { label: string; items: NavItem[] }[] = [
  { label: 'Primary', items: [
    { href: '/', label: 'Discover', icon: 'spark' },
    { href: '/conversations', label: 'Conversations', icon: 'chat' },
    { href: '/inbox', label: 'My inbox', icon: 'check' },
    { href: '/executive', label: 'Executive overview', icon: 'pulse', roles: ['management'] },
    { href: '/spaces', label: 'Spaces', icon: 'grid' },
    { href: '/jobs', label: 'Jobs', icon: 'clock', roles: ['operations', 'management'] },
  ] },
  { label: 'Business data', items: [
    { href: '/documents', label: 'Document ingestion', icon: 'upload' },
    { href: '/data', label: 'Database explorer', icon: 'database' },
    { href: '/quotations', label: 'Quotations', icon: 'send', roles: ['sales', 'operations', 'management'] },
    { href: '/deadlines', label: 'Deadlines', icon: 'calendar', roles: ['sales', 'operations', 'management'] },
    { href: '/finance', label: 'Finance overview', icon: 'chart', roles: ['finance', 'management'] },
    { href: '/reports', label: 'Tender reports', icon: 'file', roles: ['sales', 'operations', 'management'] },
  ] },
  { label: 'Operations', items: [
    { href: '/audits', label: 'Audit trail', icon: 'file', roles: ['management'] },
    { href: '/metrics', label: 'Adoption metrics', icon: 'pulse', roles: ['management'] },
  ] },
];

export function Shell({ children, title }: { children: React.ReactNode; title: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const saved = window.localStorage.getItem('street-smart-theme');
    const initial = saved === 'light' || saved === 'dark' ? saved : 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);
  const switchTheme = (next: 'dark' | 'light') => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('street-smart-theme', next);
  };
  const pathname = usePathname();
  const router = useRouter();
  const { toast, toastText } = useToast();
  const { user, users, ready, login, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const initials = (user?.name ?? '··').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  // Guard: belum login → lempar ke /login (kecuali memang di /login).
  useEffect(() => {
    if (!ready) return;
    if (!user && pathname !== '/login') router.replace('/login');
  }, [ready, user, pathname, router]);

  const submitSearch = () => {
    if (!globalSearch.trim()) return;
    router.push(`/conversation?q=${encodeURIComponent(globalSearch)}`);
    setGlobalSearch('');
  };

  // Notifikasi live dari /api/notifications (data nyata per-role, bukan mock).
  interface Notice { id: string; severity: 'high' | 'medium' | 'info'; title: string; detail: string; href: string }
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    if (!ready || !user) { setNotices([]); return; }
    let off = false;
    (async () => {
      const rows = await api.get<{ items: Notice[] }>('/api/notifications', { items: [] });
      if (!off) setNotices(rows.items ?? []);
    })();
    const t = setInterval(async () => {
      const rows = await api.get<{ items: Notice[] }>('/api/notifications', { items: [] });
      if (!off) setNotices(rows.items ?? []);
    }, 60_000);
    return () => { off = true; clearInterval(t); };
  }, [ready, user?.id]);

  return <div className="app">
    <header className="topbar">
      <div className="brand">
        <Button icon="menu" variant="icon" className="mobile-menu" title="Open navigation" onClick={() => setMobileNav(!mobileNav)} />
        <Link href="/" className="brand-button"><span className="brand-mark">S</span><span className="brand-words"><strong>Street Smart Copilot</strong><small>AI BUSINESS OPERATIONS</small></span></Link>
      </div>
      <div className="global-search"><Icon name="search" />
        <Input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
          placeholder="Search conversations, tenders, distributors, documents..." />
        <span>⌘ K</span>
      </div>
      <div className="top-actions">
        <div className="theme-toggle" role="group" aria-label="Theme">
          <button className={theme === 'light' ? 'on' : ''} title="Light mode" onClick={() => switchTheme('light')}><Icon name="sun" size={14} /></button>
          <button className={theme === 'dark' ? 'on' : ''} title="Dark mode" onClick={() => switchTheme('dark')}><Icon name="moon" size={14} /></button>
        </div>
        <div className="environment"><span /> Seeded data</div>
        <div className="notification-wrap">
          <Button icon="bell" variant="icon" title={`Notifications${notices.length ? ` (${notices.length})` : ''}`} onClick={() => setNotifications(!notifications)} />
          {notices.length > 0 && <i className="notification-dot" />}
          {notifications && <div className="notification-popover"><div className="popover-title">Notifications{notices.length ? ` (${notices.length})` : ''}</div>
            {notices.length === 0 && <div className="notification-item"><span className="indicator" /><div><strong>All caught up</strong><small>No action needed right now</small></div></div>}
            {notices.map((n) => <button key={n.id} className="notification-item" style={{ width: '100%', textAlign: 'left' }}
              onClick={() => { setNotifications(false); router.push(n.href); }}>
              <span className={`indicator${n.severity === 'high' ? ' warning' : ''}`} style={n.severity === 'info' ? { opacity: 0.4 } : undefined} />
              <div><strong>{n.title}</strong><small>{n.detail}</small></div>
            </button>)}
          </div>}
        </div>
        <div className="notification-wrap">
          <button className="profile" onClick={() => setProfileOpen(!profileOpen)} title="Switch demo user (role)">
            <span>{initials}</span>
            <div><strong>{user?.name ?? 'Sign in'}</strong><small style={{ textTransform: 'capitalize' }}>{user?.role ?? 'no session'}</small></div>
            <Icon name="chevron" size={14} />
          </button>
          {profileOpen && <div className="notification-popover"><div className="popover-title">Demo user — sets role</div>
            {users.map((u) => <button key={u.id} className="notification-item" style={{ width: '100%', textAlign: 'left' }}
              onClick={async () => {
                setProfileOpen(false);
                if (u.id === user?.id) return;
                // Switch cepat antar dummy: password dummy yang sama (sss12345).
                const ok = await login(u.id, 'sss12345');
                toast(ok ? `Signed in as ${u.name} (${u.role})` : 'Login failed — is the API running?');
              }}>
              <span className="indicator" style={{ opacity: u.id === user?.id ? 1 : 0.25 }} />
              <div><strong>{u.name}</strong><small style={{ textTransform: 'capitalize' }}>{u.role}</small></div>
            </button>)}
            {user && <button className="notification-item" style={{ width: '100%', textAlign: 'left' }}
              onClick={() => { setProfileOpen(false); logout(); router.replace('/login'); }}>
              <span className="indicator warning" />
              <div><strong>Sign out</strong><small>Back to the sign-in page</small></div>
            </button>}
          </div>}
        </div>
      </div>
    </header>
      <div className="app-body">
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileNav ? 'mobile-open' : ''}`}>
          <div className="nav-scroll">{navGroups.map((group) => {
          const visible = group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
          if (!visible.length) return null;
          return <div className="nav-group" key={group.label}>
          <div className="nav-label">{group.label}</div>
          {visible.map((item) => {
            // /conversation adalah halaman detail dari item Conversations (dibuka saat klik list),
            // jadi ikut menyalakan menu Conversations — bukan menu tersendiri.
            const active = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/') || (item.href === '/conversations' && pathname === '/conversation');
            return <Link key={item.href + item.label} title={collapsed ? item.label : undefined}
              className={`nav-item ${active ? 'active' : ''}`} href={item.href} onClick={() => setMobileNav(false)}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </Link>;
          })}
        </div>;})}</div>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => toast('Help center opened')}><Icon name="help" /><span>Help &amp; support</span></button>
          <button className="nav-item" onClick={() => toast('Settings opened')}><Icon name="settings" /><span>Settings</span></button>
          <button className="nav-item collapse-action" onClick={() => setCollapsed(!collapsed)}><Icon name="chevron" /><span>Collapse sidebar</span></button>
        </div>
      </aside>
      <main className="main"><div className="mobile-context">{title}</div>{children}</main>
    </div>
    {toastText && <div className="toast"><span><Icon name="check" /></span>{toastText}</div>}
  </div>;
}
