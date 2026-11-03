'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import { parseCloseLabel, type Tender } from '@street-smart/shared';

interface Row extends Tender {
  days: number | null;
}

function groupOf(days: number | null): 'Overdue' | 'Within 14 days' | 'Within 30 days' | 'Later' | 'No date' {
  if (days === null) return 'No date';
  if (days < 0) return 'Overdue';
  if (days <= 14) return 'Within 14 days';
  if (days <= 30) return 'Within 30 days';
  return 'Later';
}

const GROUPS = ['Overdue', 'Within 14 days', 'Within 30 days', 'Later', 'No date'] as const;

export default function DeadlinesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<Tender[] | null>(null);

  const load = useCallback(async () => {
    setRows(await api.get<Tender[] | null>('/api/tenders', null));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Khusus sales + operations + management.
  if (user && user.role !== 'sales' && user.role !== 'operations' && user.role !== 'management') {
    return <Shell title="Deadlines"><div className="content-page page-scroll">
      <PageHeader title="Deadlines" subtitle="Tender closing timeline." />
      <div className="dataset"><div className="table-title">Not available for your role</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). Deadlines are visible to sales, operations and management.</div></div>
    </div></Shell>;
  }

  if (rows === null) {
    return <Shell title="Deadlines"><div className="content-page page-scroll">
      <PageHeader title="Deadlines" subtitle="Tender closing timeline." />
      <div className="dataset"><div className="table-title">Database unreachable</div>
        <div className="table-subtitle">No placeholder figures shown. Check the API connection, then reload.</div>
        <div className="action-row"><Button variant="primary" onClick={() => { load(); toast('Retrying…'); }}>Retry</Button></div></div>
    </div></Shell>;
  }

  const now = new Date();
  const withDays: Row[] = rows
    .filter((t) => t.status !== 'Won' && t.status !== 'Lost')
    .map((t) => {
      const d = parseCloseLabel(t.date);
      return { ...t, days: d ? Math.ceil((d.getTime() - now.getTime()) / 86_400_000) : null };
    })
    .sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER));

  return <Shell title="Deadlines">
    <div className="content-page page-scroll">
      <PageHeader title="Deadlines" subtitle="Copilot-tracked tender closing timeline — earliest first, live from the pipeline." />
      {GROUPS.map((g) => {
        const list = withDays.filter((r) => groupOf(r.days) === g);
        if (!list.length) return null;
        return <div className="table-card" key={g} style={{ marginBottom: 14 }}>
          <div className="table-toolbar"><div><div className="table-title">{g}</div><div className="table-subtitle">{list.length} tender{list.length === 1 ? '' : 's'}</div></div>
            <Status tone={g === 'Overdue' ? 'red' : g === 'Within 14 days' ? 'amber' : g === 'No date' ? 'gray' : 'green'}>{g}</Status></div>
          <div className="job-list">{list.map((t) => <div className="job-row" key={t.id}>
            <div className="job-main"><div className="job-icon"><Icon name="calendar" /></div><div><div className="job-name">{t.name}</div><div className="job-agent">{t.id} · {t.agency} · {t.value}</div></div></div>
            <div className="job-cell"><span>Closes</span>{t.date}{t.days !== null && t.days >= 0 ? ` · in ${t.days}d` : t.days !== null ? ` · ${-t.days}d ago` : ''}</div>
            <div className="job-status"><Status tone={t.status === 'Submitted' ? 'blue' : t.status === 'Pending' ? 'amber' : 'gray'}>{t.status}</Status></div>
            <div className="toolbar-actions"><Link className="btn btn-secondary" href="/data">Open</Link></div>
          </div>)}</div>
        </div>;
      })}
    </div>
  </Shell>;
}
