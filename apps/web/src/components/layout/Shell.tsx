'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Icon, Input, type IconName } from '@/components/ui/primitives';
import { useToast } from '@/lib/store';

export type NavItem = { href: string; label: string; icon: IconName; badge?: string };

export const navGroups: { label: string; items: NavItem[] }[] = [
  { label: 'Primary', items: [
    { href: '/', label: 'Discover', icon: 'spark' },
    { href: '/conversations', label: 'Conversations', icon: 'chat' },
    { href: '/spaces', label: 'Spaces', icon: 'grid' },
    { href: '/jobs', label: 'Jobs', icon: 'clock' },
  ] },
  { label: 'Business data', items: [
    { href: '/documents', label: 'Document ingestion', icon: 'upload' },
    { href: '/data', label: 'Database explorer', icon: 'database' },
    { href: '/connections', label: 'DB connections', icon: 'link' },
    { href: '/reports', label: 'Tender reports', icon: 'chart' },
  ] },
  { label: 'Operations', items: [
    { href: '/status', label: 'System status', icon: 'pulse' },
    { href: '/alerts', label: 'Alerts', icon: 'bell', badge: '2' },
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

  const submitSearch = () => {
    if (!globalSearch.trim()) return;
    router.push(`/conversation?q=${encodeURIComponent(globalSearch)}`);
    setGlobalSearch('');
  };

  return <div className="app">
    <header className="topbar">
      <div className="brand">
        <Button icon="menu" variant="icon" className="mobile-menu" title="Open navigation" onClick={() => setMobileNav(!mobileNav)} />
        <Link href="/" className="brand-button"><span className="brand-mark">S</span><span className="brand-words"><strong>Street Smart Cockpit</strong><small>AI BUSINESS OPERATIONS</small></span></Link>
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
        <div className="environment"><span /> Simulation</div>
        <div className="notification-wrap">
          <Button icon="bell" variant="icon" title="Notifications" onClick={() => setNotifications(!notifications)} />
          <i className="notification-dot" />
          {notifications && <div className="notification-popover"><div className="popover-title">Notifications</div>
            <div className="notification-item"><span className="indicator warning" /><div><strong>Tender deadline approaching</strong><small>Auckland closes in 5 days</small></div></div>
            <div className="notification-item"><span className="indicator" /><div><strong>Report ready</strong><small>Weekly sales summary generated</small></div></div>
          </div>}
        </div>
        <button className="profile" onClick={() => toast('Profile menu opened')}><span>IN</span><div><strong>Isaac Ngatai</strong><small>Operations</small></div><Icon name="chevron" size={14} /></button>
      </div>
    </header>
    <div className="app-body">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileNav ? 'mobile-open' : ''}`}>
        <div className="nav-scroll">{navGroups.map((group) => <div className="nav-group" key={group.label}>
          <div className="nav-label">{group.label}</div>
          {group.items.map((item) => {
            // /conversation adalah halaman detail dari item Conversations (dibuka saat klik list),
            // jadi ikut menyalakan menu Conversations — bukan menu tersendiri.
            const active = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/') || (item.href === '/conversations' && pathname === '/conversation');
            return <Link key={item.href + item.label} title={collapsed ? item.label : undefined}
              className={`nav-item ${active ? 'active' : ''}`} href={item.href} onClick={() => setMobileNav(false)}>
              <Icon name={item.icon} /><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}
            </Link>;
          })}
        </div>)}</div>
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
