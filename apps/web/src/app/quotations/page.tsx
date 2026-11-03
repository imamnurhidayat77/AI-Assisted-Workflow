'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Input, PageHeader, Status } from '@/components/ui/primitives';
import { api, getStoredKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import { formatMoney, renderDraftBody, type Draft, type Quotation } from '@street-smart/shared';

function tone(s: string): 'gray' | 'blue' | 'green' | 'red' | 'amber' {
  if (s === 'approved') return 'green';
  if (s === 'rejected') return 'red';
  if (s === 'sent' || s === 'in_review') return 'blue';
  if (s === 'expired') return 'gray';
  return 'amber';
}

export default function QuotationsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<Quotation[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [partner, setPartner] = useState('');
  const [amount, setAmount] = useState('');
  const [tenderId, setTenderId] = useState('');

  const load = useCallback(async () => {
    setRows(await api.get<Quotation[]>('/api/quotations', []));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Khusus sales + operations + management (server 403 untuk role lain).
  if (user && user.role !== 'sales' && user.role !== 'operations' && user.role !== 'management') {
    return <Shell title="Quotations"><div className="content-page page-scroll">
      <PageHeader title="Quotations" subtitle="Customer quotations linked to tenders." />
      <div className="dataset"><div className="table-title">Not available for your role</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). Quotations are visible to sales, operations and management.</div></div>
    </div></Shell>;
  }

  const create = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!title.trim() || !partner.trim() || !Number.isFinite(amountCents) || amountCents < 0) {
      toast('Fill title, partner and amount (NZD) first');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${api.base}/api/quotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getStoredKey() ? { 'X-API-Key': getStoredKey() } : {}) },
        body: JSON.stringify({ title: title.trim(), partner: partner.trim(), amountCents, tenderId: tenderId.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTitle('');
      setPartner('');
      setAmount('');
      setTenderId('');
      await load();
      toast('Quotation created as draft');
    } catch {
      toast('Create failed — check the API connection');
    } finally {
      setCreating(false);
    }
  };

  // Masuk flow maker-checker: draft quotation-review tertaut ke tender.
  const requestApproval = async (q: Quotation) => {
    const payload = {
      kind: 'quotation-review' as const,
      title: `Quotation review: ${q.number} — ${q.title}`,
      sourceQuotationId: q.id,
      body: renderDraftBody('quotation-review', {
        summary: `Review requested for quotation ${q.number} to ${q.partner} (${formatMoney(q.amountCents, q.currency)}).`,
        facts: [
          `${q.number} — ${q.title}`,
          `Partner: ${q.partner}`,
          `Amount: ${formatMoney(q.amountCents, q.currency)}`,
          ...(q.tenderId ? [`Tender: ${q.tenderId}`] : []),
          `Status: ${q.status}`,
        ],
        recommendation: 'Check pricing against the tender requirements, then approve or send back with notes.',
        assistantName: 'Sales Assistant',
      }),
      tenderIds: q.tenderId ? [q.tenderId] : [],
    };
    let created: Draft | null = null;
    try {
      const r = await fetch(`${api.base}/api/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getStoredKey() ? { 'X-API-Key': getStoredKey() } : {}) },
        body: JSON.stringify(payload),
      });
      if (r.ok) created = (await r.json()) as Draft;
    } catch { /* offline → null di bawah */ }
    if (!created) {
      toast('Draft not created — API/database unreachable');
      return;
    }
    const r = await fetch(`${api.base}/api/drafts/${created.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(getStoredKey() ? { 'X-API-Key': getStoredKey() } : {}) },
    });
    toast(r.ok ? `Submitted for review — checkers see it in My inbox` : 'Draft created but submit failed');
  };

  return <Shell title="Quotations">
    <div className="content-page page-scroll">
      <PageHeader title="Quotations" subtitle="Copilot-assisted quotations — request approval to enter maker-checker." />
      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">New quotation</div><div className="table-subtitle">Saved as draft — approval goes through My inbox</div></div></div>
        <div className="data-toolbar">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. SRS-8 supply Q4" />
          <Input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Partner — e.g. Auckland Distributor Ltd" />
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount NZD" inputMode="decimal" />
          <Input value={tenderId} onChange={(e) => setTenderId(e.target.value)} placeholder="Tender ID (optional)" />
          <Button icon="plus" variant="primary" onClick={create} disabled={creating}>{creating ? 'Saving…' : 'Create'}</Button>
        </div>
      </div>
      <div className="table-card">
        <div className="table-toolbar"><div><div className="table-title">Pipeline</div><div className="table-subtitle">{rows.length} quotations</div></div></div>
        {rows.length === 0
          ? <div className="table-subtitle">No quotations yet — create the first one above. Real data only; nothing is mocked here.</div>
          : <div className="table-scroll"><table><thead><tr>{['Number', 'Title', 'Partner', 'Tender', 'Amount', 'Status', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((q) => <tr key={q.id}>
              <td className="id-cell">{q.number}</td><td>{q.title}</td><td>{q.partner}</td>
              <td>{q.tenderId ? <Link className="tender-link" style={{ margin: 0, padding: 0, border: 0 }} href="/data">{q.tenderId}</Link> : '—'}</td>
              <td>{formatMoney(q.amountCents, q.currency)}</td>
              <td><Status tone={tone(q.status)}>{q.status}</Status></td>
              <td>{(q.status === 'draft' || q.status === 'rejected') && <Button variant="secondary" onClick={() => requestApproval(q)}>Request approval</Button>}</td>
            </tr>)}</tbody></table></div>}
      </div>
    </div>
  </Shell>;
}
