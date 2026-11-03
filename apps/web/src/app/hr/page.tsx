'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import type { HrPolicy, LeaveRow } from '@street-smart/shared';

interface Overview {
  policies: HrPolicy[];
  roster: LeaveRow[];
}

export default function HrPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    setData(await api.get<Overview | null>('/api/hr/overview', null));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Khusus hr + management (server 403 untuk role lain).
  if (user && user.role !== 'hr' && user.role !== 'management') {
    return <Shell title="HR overview"><div className="content-page page-scroll">
      <PageHeader title="HR overview" subtitle="Policies and aggregate team capacity." />
      <div className="dataset"><div className="table-title">Not available for your role</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). HR data is visible to hr and management.</div></div>
    </div></Shell>;
  }

  if (data === null) {
    return <Shell title="HR overview"><div className="content-page page-scroll">
      <PageHeader title="HR overview" subtitle="Policies and aggregate team capacity." />
      <div className="dataset"><div className="table-title">Database tidak terjangkau</div>
        <div className="table-subtitle">Tidak ada angka palsu yang ditampilkan. Periksa koneksi API lalu muat ulang.</div>
        <div className="action-row"><Button variant="primary" onClick={() => { load(); toast('Retrying…'); }}>Retry</Button></div></div>
    </div></Shell>;
  }

  const headcount = data.roster.reduce((a, r) => a + r.headcount, 0);
  const onLeave = data.roster.reduce((a, r) => a + r.onLeave, 0);

  return <Shell title="HR overview">
    <div className="content-page page-scroll">
      <PageHeader title="HR overview" subtitle="Aggregate capacity only — individual salaries are never shown." action={<Link className="btn btn-primary" href="/conversation">Ask HR Assistant</Link>} />
      <div className="summary-row">
        <div className="summary-card"><span>Headcount</span><strong>{headcount}</strong><small>across {data.roster.length} teams</small></div>
        <div className="summary-card"><span>On leave</span><strong>{onLeave}</strong><small>this week, all teams</small></div>
        <div className="summary-card"><span>Policies</span><strong>{data.policies.length}</strong><small>handbook topics</small></div>
      </div>
      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Team capacity</div><div className="table-subtitle">Headcount vs on leave per team</div></div></div>
        <div className="table-scroll"><table><thead><tr>{['Team', 'Week', 'Headcount', 'On leave', 'Available'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{data.roster.map((r) => <tr key={r.id}><td>{r.team}</td><td>{r.weekLabel}</td><td>{r.headcount}</td><td><Status tone={r.onLeave > 0 ? 'amber' : 'green'}>{r.onLeave}</Status></td><td>{r.headcount - r.onLeave}</td></tr>)}</tbody></table></div>
      </div>
      <div className="table-card">
        <div className="table-toolbar"><div><div className="table-title">Policy handbook</div><div className="table-subtitle">Ask the HR Assistant for details on any topic</div></div></div>
        <div className="job-list">{data.policies.map((p) => <div className="job-row" key={p.id}>
          <div className="job-main"><div className="job-icon"><Icon name="file" /></div><div><div className="job-name">{p.title}</div><div className="job-agent">{p.topic} · {p.summary}</div></div></div>
        </div>)}</div>
      </div>
    </div>
  </Shell>;
}
