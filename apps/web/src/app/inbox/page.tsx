'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api, getStoredKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import type { Draft } from '@street-smart/shared';

interface Inbox {
  awaiting: Draft[];
  mine: Draft[];
}

const EMPTY: Inbox = { awaiting: [], mine: [] };

function tone(s: Draft['status']): 'gray' | 'blue' | 'green' | 'red' | 'amber' {
  if (s === 'approved') return 'green';
  if (s === 'rejected') return 'red';
  if (s === 'in_review') return 'blue';
  return 'gray';
}

export default function InboxPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [box, setBox] = useState<Inbox>(EMPTY);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api.get<Inbox>('/api/drafts/inbox', EMPTY);
    setBox(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (d: Draft, action: 'approve' | 'reject') => {
    setActing(d.id);
    try {
      const r = await fetch(`${api.base}/api/drafts/${d.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getStoredKey() ? { 'X-API-Key': getStoredKey() } : {}) },
        body: '{}',
      });
      const json = (await r.json().catch(() => null)) as Draft & { error?: string } | null;
      if (!r.ok) {
        // 403 maker-checker (mis. approve draft sendiri) tampil jujur, bukan sukses palsu.
        toast(json?.error ?? 'Decision rejected by server');
      } else if (json) {
        toast(action === 'approve' ? `Approved — recorded under ${json.decidedBy ?? user?.name ?? 'you'}` : 'Rejected — maker notified to fix it');
      }
    } catch {
      toast('API unreachable — decision not recorded');
    }
    await load();
    setActing(null);
  };

  return <Shell title="My inbox">
    <div className="content-page page-scroll">
      <PageHeader title="My inbox" subtitle="Drafts waiting for your decision, plus your own drafts that need action." action={<Button icon="refresh" variant="icon" title="Refresh" onClick={async () => { await load(); toast('Inbox refreshed'); }} />} />
      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Awaiting my decision</div><div className="table-subtitle">{box.awaiting.length ? 'You are the checker — review, then approve or reject.' : 'Nothing waiting — you are all caught up.'}</div></div><Status tone={box.awaiting.length ? 'amber' : 'green'}>{box.awaiting.length} pending</Status></div>
        <div className="job-list">{box.awaiting.length === 0 ? <div className="table-subtitle">No drafts need your decision right now.</div> : box.awaiting.map((d) => <div className="job-row" key={d.id}>
          <div className="job-main"><div className="job-icon"><Icon name="file" /></div><div><div className="job-name">{d.title}</div><div className="job-agent">{d.kind}{d.createdBy ? ` · by ${d.createdBy}` : ''}</div></div></div>
          <div className="job-cell"><span>Updated</span>{new Date(d.updatedAt).toLocaleString()}</div>
          <div className="job-status"><Status tone={tone(d.status)}>{d.status}</Status></div>
          <div className="toolbar-actions">
            <Button variant="primary" onClick={() => decide(d, 'approve')} disabled={acting === d.id}>Approve</Button>
            <Button variant="danger" onClick={() => decide(d, 'reject')} disabled={acting === d.id}>Reject</Button>
          </div>
        </div>)}</div>
      </div>
      <div className="table-card">
        <div className="table-toolbar"><div><div className="table-title">My drafts needing action</div><div className="table-subtitle">Continue working, or fix and resubmit what was rejected.</div></div><Status tone="blue">{box.mine.length} open</Status></div>
        <div className="job-list">{box.mine.length === 0 ? <div className="table-subtitle">No open drafts of yours. <Link className="tender-link" style={{ display: 'inline', margin: 0, padding: 0, border: 0 }} href="/conversation">Start one in conversation</Link>.</div> : box.mine.map((d) => <div className="job-row" key={d.id}>
          <div className="job-main"><div className="job-icon"><Icon name={d.status === 'rejected' ? 'close' : 'chat'} /></div><div><div className="job-name">{d.title}</div><div className="job-agent">{d.kind}</div></div></div>
          <div className="job-cell"><span>Updated</span>{new Date(d.updatedAt).toLocaleString()}</div>
          <div className="job-status"><Status tone={tone(d.status)}>{d.status}</Status></div>
          <div className="toolbar-actions"><Link className="btn btn-secondary" href="/conversation">Open</Link></div>
        </div>)}</div>
      </div>
    </div>
  </Shell>;
}
