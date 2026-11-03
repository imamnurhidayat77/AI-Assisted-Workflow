'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import { useToast } from '@/lib/store';
import type { Draft, JobItem } from '@street-smart/shared';

export default function JobsPage() {
  const { toast } = useToast();
  // Tanpa job palsu: mulai kosong; gagal load → error eksplisit.
  const [rows, setRows] = useState<JobItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [history, setHistory] = useState<Draft[]>([]);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [live, drafts] = await Promise.all([
      api.get<JobItem[] | null>('/api/jobs', null),
      api.get<Draft[]>('/api/drafts', []),
    ]);
    if (!live) {
      setRows([]);
      setLoadError(true);
      return [];
    }
    setLoadError(false);
    setRows(live);
    // Riwayat keputusan permanen (DB) — tidak hilang walau sudah keluar antrean.
    setHistory(drafts.filter((d) => d.status === 'approved' || d.status === 'rejected'));
    return live;
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: antrean + riwayat ikut berubah saat draft dibuat/diputus dari
  // halaman lain (documents/conversation). REST tetap sumber kebenaran.
  const [liveFeed, setLiveFeed] = useState(false);
  useEffect(() => {
    let off = false;
    let cleanup: (() => void) | undefined;
    getSocket().then((s) => {
      if (off || !s) return;
      setLiveFeed(true);
      const onChange = () => { load(); };
      s.on('draft:changed', onChange);
      cleanup = () => { s.off('draft:changed', onChange); };
    });
    return () => { off = true; cleanup?.(); };
  }, [load]);

  // Single approval door: queued drafts (in_review/draft) can be decided right here.
  // decidedBy comes from the login session (server-side, spoof-proof).
  const { user: sessionUser } = useAuth();
  const decide = async (job: JobItem, action: 'approve' | 'reject') => {
    if (!job.draftId) { toast(`${job.name} details opened`); return; }
    setActing(job.draftId);
    // Tanpa status palsu: gagal API = tidak ada perubahan lokal, toast error eksplisit.
    const updated = await api.post<Draft | null>(`/api/drafts/${job.draftId}/${action}`, {}, null);
    await load();
    setActing(null);
    if (!updated) {
      toast('Decision not saved — API/database unreachable. Nothing changed.');
      return;
    }
    toast(action === 'approve' ? `Draft approved — recorded under ${updated.decidedBy ?? sessionUser?.name ?? 'you'}` : 'Draft rejected — reopen it from the draft flow');
  };

  const awaiting = rows.filter((r) => r.draftId).length;
  const active = rows.filter((r) => r.state === 'Active' || r.state === 'Running').length;

  // Jobs queue hanya untuk operations + management (server tetap enforcement via draft ownership).
  if (sessionUser && sessionUser.role !== 'operations' && sessionUser.role !== 'management') {
    return <Shell title="Jobs"><div className="content-page page-scroll">
      <PageHeader title="Jobs & automations" subtitle="AI agents working across operational workflows." />
      <div className="dataset"><div className="table-title">Operations only</div>
        <div className="table-subtitle">Signed in as {sessionUser.name} ({sessionUser.role}). Switch to an operations or management user to view the job queue.</div></div>
    </div></Shell>;
  }

  return <Shell title="Jobs">
    <div className="content-page page-scroll"><PageHeader title="Jobs & automations" subtitle="Copilot automations working across your operational workflows." action={<Button icon="plus" variant="primary" onClick={() => toast('Job builder opened')}>Create job</Button>} />
      <div className="summary-row"><div className="summary-card"><span>Active jobs</span><strong>{active}</strong><small>Across agents</small></div><div className="summary-card"><span>Decided drafts</span><strong>{history.length}</strong><small>Audit permanen</small></div><div className="summary-card"><span>Awaiting review</span><strong>{awaiting}</strong><small>Human approval required</small></div></div>
      <div className="table-card"><div className="table-toolbar"><div><div className="table-title">All jobs</div><div className="table-subtitle">{loadError ? 'Database unreachable — no placeholder jobs shown' : `Live queue — drafts awaiting your decision on top${liveFeed ? ' · realtime on' : ''}`}</div></div><div className="table-subtitle">Signed in as {sessionUser ? `${sessionUser.name} (${sessionUser.role})` : '…'} — decisions are recorded under this name.</div><div className="toolbar-actions"><Button icon="filter">Filter</Button><Button icon="refresh" onClick={async () => { await load(); toast('Job statuses refreshed'); }}>Refresh</Button></div></div>
        <div className="job-list">{rows.length === 0 && !loadError ? <div className="table-subtitle">No jobs tracked yet.</div> : rows.map((job) => <div className="job-row" key={`${job.draftId ?? job.name}`}>
          <div className="job-main"><div className="job-icon"><Icon name={job.state === 'Completed' ? 'check' : job.state === 'Scheduled' ? 'calendar' : 'spark'} /></div><div><div className="job-name">{job.name}</div><div className="job-agent">{job.agent}{job.draftStatus ? ` · ${job.draftStatus}` : ''}</div></div></div>
          <div className="job-cell"><span>Trigger</span>{job.trigger}</div><div className="job-cell"><span>Last run</span>{job.lastRun}</div>
          <div className="job-status"><Status tone={job.state === 'Completed' || job.state === 'Active' ? 'green' : job.state === 'Running' ? 'blue' : 'gray'}>{job.draftId ? 'Awaiting review' : job.state}</Status>{job.progress !== '—' && <div className="mini-progress"><i style={{ width: job.progress }} /></div>}</div>
          {job.draftId ? <div className="toolbar-actions">
            <Button variant="primary" onClick={() => decide(job, 'approve')} disabled={acting === job.draftId}>Approve</Button>
            <Button variant="danger" onClick={() => decide(job, 'reject')} disabled={acting === job.draftId}>Reject</Button>
          </div> : <Button icon="chevron" variant="icon" title="View details" onClick={() => toast(`${job.name} details opened`)} />}
        </div>)}</div>
      </div>
      <div className="table-card"><div className="table-toolbar"><div><div className="table-title">Decision history</div><div className="table-subtitle">Final human decisions — permanent in the database</div></div></div>
        <div className="job-list">{history.length === 0 ? <div className="table-subtitle">No decisions yet — approve/reject drafts from the queue above.</div> : history.map((d) => <div className="job-row" key={d.id}>
          <div className="job-main"><div className="job-icon"><Icon name={d.status === 'approved' ? 'check' : 'close'} /></div><div><div className="job-name">{d.title}</div><div className="job-agent">{d.kind}{d.sourceDocumentName ? ` · from ${d.sourceDocumentName}` : ''}</div></div></div>
          <div className="job-cell"><span>Decided by</span>{d.decidedBy ?? '—'}</div><div className="job-cell"><span>Decided at</span>{d.decidedAt ? new Date(d.decidedAt).toLocaleString() : '—'}</div>
          <div className="job-status"><Status tone={d.status === 'approved' ? 'green' : 'red'}>{d.status}</Status></div>
        </div>)}</div>
      </div>
    </div>
  </Shell>;
}
