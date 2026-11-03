'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import type { Draft } from '@street-smart/shared';

interface AuditRow {
  role: string;
  assistantId: string;
  via: string;
}

function countBy<T>(rows: T[], key: (r: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function MetricsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [audits, setAudits] = useState<AuditRow[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);

  const load = useCallback(async () => {
    const [a, d] = await Promise.all([
      api.get<AuditRow[]>('/api/audit?take=500', []),
      api.get<Draft[]>('/api/drafts', []),
    ]);
    // api.get menelan 403 jadi fallback — bedakan via role (server tetap enforcement).
    if (user && user.role === 'management') {
      setAudits(a);
      setDrafts(d);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Khusus management (data agregat lintas-user).
  if (user && user.role !== 'management') {
    return <Shell title="Metrics"><div className="content-page page-scroll">
      <PageHeader title="Adoption metrics" subtitle="Copilot usage and draft funnel." />
      <div className="dataset"><div className="table-title">Not available for your role</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). Metrics are visible to management.</div></div>
    </div></Shell>;
  }

  const decided = (drafts ?? []).filter((d) => d.status === 'approved' || d.status === 'rejected');
  const approved = (drafts ?? []).filter((d) => d.status === 'approved').length;
  const escalated = (drafts ?? []).filter((d) => d.history.some((h) => h.action === 'escalated')).length;
  const byRole = countBy(audits ?? [], (r) => r.role);
  const byAssistant = countBy(audits ?? [], (r) => r.assistantId);
  const byVia = countBy(audits ?? [], (r) => r.via);
  const maxRole = Math.max(1, ...byRole.map(([, n]) => n));

  return <Shell title="Metrics">
    <div className="content-page page-scroll">
      <PageHeader title="Adoption metrics" subtitle="Copilot usage and draft funnel — computed live, aggregate only." action={<Button icon="refresh" variant="icon" title="Refresh" onClick={async () => { await load(); toast('Metrics refreshed'); }} />} />
      <div className="summary-row">
        <div className="summary-card"><span>Chat turns (last 500)</span><strong>{audits?.length ?? '…'}</strong><small>across roles</small></div>
        <div className="summary-card"><span>Draft approval rate</span><strong>{decided.length ? `${Math.round((approved / decided.length) * 100)}%` : '—'}</strong><small>{approved}/{decided.length} decided</small></div>
        <div className="summary-card"><span>Escalated (SLA)</span><strong>{drafts ? escalated : '…'}</strong><small>awaiting too long</small></div>
      </div>
      <div className="report-grid">
        <div className="table-card country-card"><div className="table-title">Usage by role</div><div className="table-subtitle">Chat turns per role</div>
          {(audits === null || byRole.length === 0) && <div className="table-subtitle">No usage yet.</div>}
          {byRole.map(([name, n]) => <div className="country-row" key={name}><div><span>{name}</span><strong>{n}</strong></div><div className="country-track"><i style={{ width: `${Math.round((n / maxRole) * 100)}%` }} /></div></div>)}
        </div>
        <div className="table-card country-card"><div className="table-title">Usage by assistant</div><div className="table-subtitle">Including answer source mix</div>
          {byAssistant.map(([name, n]) => <div className="country-row" key={name}><div><span>{name}</span><strong>{n}</strong></div></div>)}
          <div className="country-row"><div><span>Answer source</span><strong>{byVia.map(([v, n]) => `${v}: ${n}`).join(' · ') || '—'}</strong></div></div>
        </div>
      </div>
      <div className="table-card" style={{ marginTop: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Draft funnel</div><div className="table-subtitle">All drafts visible to management</div></div><Link className="btn btn-secondary" href="/jobs">Open Jobs</Link></div>
        <div className="job-list">{(drafts ?? []).slice(0, 10).map((d) => <div className="job-row" key={d.id}>
          <div className="job-main"><div className="job-icon"><Icon name="file" /></div><div><div className="job-name">{d.title}</div><div className="job-agent">{d.kind}{d.createdBy ? ` · by ${d.createdBy}` : ''}{d.decidedBy ? ` · decided by ${d.decidedBy}` : ''}</div></div></div>
          <div className="job-status"><Status tone={d.status === 'approved' ? 'green' : d.status === 'rejected' ? 'red' : d.status === 'in_review' ? 'blue' : 'gray'}>{d.status}</Status></div>
        </div>)}</div>
      </div>
      <p className="disclaimer">Denied-access and SQL-rejection counts are not tracked yet — needs a server event log (see handover §8).</p>
    </div>
  </Shell>;
}
