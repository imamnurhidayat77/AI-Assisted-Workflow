'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/lib/store';
import { jobs as fallbackJobs, type Draft, type JobItem } from '@street-smart/shared';

export default function JobsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<JobItem[]>(fallbackJobs);
  const [history, setHistory] = useState<Draft[]>([]);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [live, drafts] = await Promise.all([
      api.get<JobItem[]>('/api/jobs', fallbackJobs),
      api.get<Draft[]>('/api/drafts', []),
    ]);
    setRows(live);
    // Riwayat keputusan permanen (DB) — tidak hilang walau sudah keluar antrean.
    setHistory(drafts.filter((d) => d.status === 'approved' || d.status === 'rejected'));
    return live;
  }, []);

  useEffect(() => { load(); }, [load]);

  // Single approval door: queued drafts (in_review/draft) can be decided right here.
  // Decisions are recorded under a human name; nothing executes automatically.
  const decide = async (job: JobItem, action: 'approve' | 'reject') => {
    if (!job.draftId) { toast(`${job.name} details opened`); return; }
    setActing(job.draftId);
    // If the API is down, fallback = drop from the local queue to prevent double clicks.
    const fallback: Draft = {
      id: job.draftId, kind: 'general', title: job.name, body: '',
      status: action === 'approve' ? 'approved' : 'rejected',
      createdAt: '', updatedAt: new Date().toISOString(), history: [],
    };
    await api.post<Draft>(`/api/drafts/${job.draftId}/${action}`, { decidedBy: 'you' }, fallback);
    await load();
    setActing(null);
    toast(action === 'approve' ? 'Draft approved — decision recorded' : 'Draft rejected — reopen it from the draft flow');
  };

  const awaiting = rows.filter((r) => r.draftId).length;
  const active = rows.filter((r) => r.state === 'Active' || r.state === 'Running').length;

  return <Shell title="Jobs">
    <div className="content-page page-scroll"><PageHeader title="Jobs & automations" subtitle="AI agents working across your operational workflows." action={<Button icon="plus" variant="primary" onClick={() => toast('Job builder opened')}>Create job</Button>} />
      <div className="summary-row"><div className="summary-card"><span>Active jobs</span><strong>{active}</strong><small>Across agents</small></div><div className="summary-card"><span>Decided drafts</span><strong>{history.length}</strong><small>Audit permanen</small></div><div className="summary-card"><span>Awaiting review</span><strong>{awaiting}</strong><small>Human approval required</small></div></div>
      <div className="table-card"><div className="table-toolbar"><div><div className="table-title">All jobs</div><div className="table-subtitle">Live queue — drafts awaiting your decision on top</div></div><div className="toolbar-actions"><Button icon="filter">Filter</Button><Button icon="refresh" onClick={async () => { await load(); toast('Job statuses refreshed'); }}>Refresh</Button></div></div>
        <div className="job-list">{rows.map((job) => <div className="job-row" key={`${job.draftId ?? job.name}`}>
          <div className="job-main"><div className="job-icon"><Icon name={job.state === 'Completed' ? 'check' : job.state === 'Scheduled' ? 'calendar' : 'spark'} /></div><div><div className="job-name">{job.name}</div><div className="job-agent">{job.agent}{job.draftStatus ? ` · ${job.draftStatus}` : ''}</div></div></div>
          <div className="job-cell"><span>Trigger</span>{job.trigger}</div><div className="job-cell"><span>Last run</span>{job.lastRun}</div>
          <div className="job-status"><Status tone={job.state === 'Completed' || job.state === 'Active' ? 'green' : job.state === 'Running' ? 'blue' : 'gray'}>{job.draftId ? 'Awaiting review' : job.state}</Status>{job.progress !== '—' && <div className="mini-progress"><i style={{ width: job.progress }} /></div>}</div>
          {job.draftId ? <div className="toolbar-actions">
            <Button variant="primary" onClick={() => decide(job, 'approve')} disabled={acting === job.draftId}>Approve</Button>
            <Button variant="danger" onClick={() => decide(job, 'reject')} disabled={acting === job.draftId}>Reject</Button>
          </div> : <Button icon="chevron" variant="icon" title="View details" onClick={() => toast(`${job.name} details opened`)} />}
        </div>)}</div>
      </div>
      <div className="table-card"><div className="table-toolbar"><div><div className="table-title">Decision history</div><div className="table-subtitle">Keputusan final manusia — permanen di database</div></div></div>
        <div className="job-list">{history.length === 0 ? <div className="table-subtitle">Belum ada keputusan — approve/reject draft dari antrean di atas.</div> : history.map((d) => <div className="job-row" key={d.id}>
          <div className="job-main"><div className="job-icon"><Icon name={d.status === 'approved' ? 'check' : 'close'} /></div><div><div className="job-name">{d.title}</div><div className="job-agent">{d.kind}{d.sourceDocumentName ? ` · dari ${d.sourceDocumentName}` : ''}</div></div></div>
          <div className="job-cell"><span>Decided by</span>{d.decidedBy ?? '—'}</div><div className="job-cell"><span>Decided at</span>{d.decidedAt ? new Date(d.decidedAt).toLocaleString() : '—'}</div>
          <div className="job-status"><Status tone={d.status === 'approved' ? 'green' : 'red'}>{d.status}</Status></div>
        </div>)}</div>
      </div>
    </div>
  </Shell>;
}
