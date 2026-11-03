'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import { formatMoney, type CloseCheckItem, type Invoice } from '@street-smart/shared';

interface Overview {
  invoices: Invoice[];
  checklist: CloseCheckItem[];
}

function tone(s: Invoice['status']): 'gray' | 'blue' | 'green' | 'red' | 'amber' {
  if (s === 'PAID') return 'green';
  if (s === 'OVERDUE') return 'red';
  if (s === 'PARTIAL') return 'blue';
  return 'amber';
}

export default function FinancePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    setData(await api.get<Overview | null>('/api/finance/overview', null));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Khusus finance + management (server 403 untuk role lain).
  if (user && user.role !== 'finance' && user.role !== 'management') {
    return <Shell title="Finance overview"><div className="content-page page-scroll">
      <PageHeader title="Finance overview" subtitle="Invoices and month-end closing readiness." />
      <div className="dataset"><div className="table-title">Not available for your role</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). Finance data is visible to finance and management.</div></div>
    </div></Shell>;
  }

  if (data === null) {
    return <Shell title="Finance overview"><div className="content-page page-scroll">
      <PageHeader title="Finance overview" subtitle="Invoices and month-end closing readiness." />
      <div className="dataset"><div className="table-title">Database unreachable</div>
        <div className="table-subtitle">No placeholder figures shown. Check the API connection, then reload.</div>
        <div className="action-row"><Button variant="primary" onClick={() => { load(); toast('Retrying…'); }}>Retry</Button></div></div>
    </div></Shell>;
  }

  const sum = (dir: 'AR' | 'AP') => data.invoices.filter((i) => i.direction === dir && i.status !== 'PAID');
  const cents = (rows: Invoice[]) => rows.reduce((a, i) => a + i.amountCents, 0);
  const cur = data.invoices[0]?.currency ?? 'NZD';
  const overdue = data.invoices.filter((i) => i.status === 'OVERDUE');
  const open = data.checklist.filter((c) => !c.done);

  return <Shell title="Finance overview">
    <div className="content-page page-scroll">
      <PageHeader title="Finance overview" subtitle={`Aggregate only — no bank details. Live from ${data.invoices.length} invoices.`} action={<Link className="btn btn-primary" href="/conversation">Ask Finance Assistant</Link>} />
      <div className="summary-row">
        <div className="summary-card"><span>Open AR</span><strong>{formatMoney(cents(sum('AR')), cur)}</strong><small>{sum('AR').length} invoices receivable</small></div>
        <div className="summary-card"><span>Open AP</span><strong>{formatMoney(cents(sum('AP')), cur)}</strong><small>{sum('AP').length} invoices payable</small></div>
        <div className="summary-card"><span>Overdue</span><strong>{overdue.length}</strong><small>need follow-up first</small></div>
      </div>
      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Invoices</div><div className="table-subtitle">AR receivable · AP payable</div></div><Status tone={overdue.length ? 'red' : 'green'}>{overdue.length ? `${overdue.length} overdue` : 'Nothing overdue'}</Status></div>
        <div className="table-scroll"><table><thead><tr>{['Invoice', 'Direction', 'Partner', 'Amount', 'Status', 'Due'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{data.invoices.map((i) => <tr key={i.id}><td className="id-cell">{i.id}</td><td>{i.direction}</td><td>{i.partner}</td><td>{formatMoney(i.amountCents, i.currency)}</td><td><Status tone={tone(i.status)}>{i.status}</Status></td><td>{i.dueLabel}</td></tr>)}</tbody></table></div>
      </div>
      <div className="table-card">
        <div className="table-toolbar"><div><div className="table-title">Month-end closing {data.checklist[0]?.period ?? ''}</div><div className="table-subtitle">{data.checklist.filter((c) => c.done).length}/{data.checklist.length} done</div></div><Status tone={open.length ? 'amber' : 'green'}>{open.length ? `${open.length} open` : 'Ready to lock'}</Status></div>
        <div className="job-list">{data.checklist.map((c) => <div className="job-row" key={c.id}>
          <div className="job-main"><div className="job-icon"><Icon name={c.done ? 'check' : 'clock'} /></div><div><div className="job-name">{c.item}</div><div className="job-agent">{c.owner} · {c.period}</div></div></div>
          <div className="job-status"><Status tone={c.done ? 'green' : 'amber'}>{c.done ? 'done' : 'open'}</Status></div>
        </div>)}</div>
      </div>
    </div>
  </Shell>;
}
