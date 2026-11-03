'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Status, Textarea, type IconName } from '@/components/ui/primitives';
import { api, getStoredKey } from '@/lib/api';
import { useToast } from '@/lib/store';
import type { Draft, SpaceActivity, SpaceDetail, SpaceAction } from '@street-smart/shared';

const KIND_ICON: Record<string, IconName> = { conversation: 'chat', document: 'file', tender: 'database', note: 'grid' };
const KIND_LINK: Record<string, (refId: string, title: string) => string | null> = {
  conversation: (_r, t) => `/conversation?q=${encodeURIComponent(t)}`,
  document: () => '/documents',
  tender: (r) => (r ? `/data` : null),
  note: () => null,
};

type LoadState = { kind: 'ok' } | { kind: 'missing' } | { kind: 'offline' };

export default function SpaceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [space, setSpace] = useState<(SpaceDetail & { ownerId?: string; ownerRole?: string; visibility?: string; status?: string }) | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'ok' });
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [actions, setActions] = useState<SpaceAction[]>([]);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    try {
      const key = getStoredKey();
      const res = await fetch(`${api.base}/api/spaces/${params.id}`, {
        cache: 'no-store',
        headers: key ? { 'X-API-Key': key } : {},
      });
      if (res.status === 404) {
        setSpace(null);
        setLoadState({ kind: 'missing' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setSpace(await res.json());
      setLoadState({ kind: 'ok' });
      const acts = await api.get<{ actions: SpaceAction[] }>(`/api/spaces/${params.id}/actions`, { actions: [] });
      setActions(acts?.actions ?? []);
    } catch {
      setSpace(null);
      setLoadState({ kind: 'offline' });
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!note.trim()) return;
    setAdding(true);
    const created = await api.post(`/api/spaces/${params.id}/items`, { kind: 'note', title: note.trim().slice(0, 200) }, null);
    setAdding(false);
    if (!created) { toast('Could not save — sign in first or check the API'); return; }
    setNote('');
    await load();
  };

  const removeItem = async (itemId: string, title: string) => {
    if (!window.confirm(`Remove "${title}" from this space?`)) return;
    const res = await api.del<{ ok: boolean } | null>(`/api/spaces/${params.id}/items/${itemId}`, null);
    if (!res?.ok) { toast('Could not remove — sign in first'); return; }
    toast(`Removed "${title}"`);
    await load();
  };

  const deleteSpace = async () => {
    if (!space || !window.confirm(`Delete space "${space.name}" and all its items?`)) return;
    const res = await api.del<{ ok: boolean } | null>(`/api/spaces/${space.id}`, null);
    if (!res?.ok) { toast('Could not delete — sign in first'); return; }
    toast('Space deleted');
    router.push('/spaces');
  };

  const archiveSpace = async () => {
    if (!space || !window.confirm(`Archive space "${space.name}"? Archived spaces are read-only.`)) return;
    setArchiving(true);
    try {
      const key = getStoredKey();
      const res = await fetch(`${api.base}/api/spaces/${space.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
      });
      if (!res.ok) throw new Error(String(res.status));
      toast('Space archived');
      await load();
    } catch {
      toast('Could not archive — sign in first or check the API');
    } finally {
      setArchiving(false);
    }
  };

  if (space === null) {
    return <Shell title="Space"><div className="content-page page-scroll"><PageHeader
      title={loadState.kind === 'missing' ? 'Space not available' : 'Space unreachable'}
      subtitle={loadState.kind === 'missing' ? 'It may have been deleted or is not shared with your role.' : 'The API may be offline.'}
      action={<Link className="btn btn-secondary" href="/spaces">Back to Spaces</Link>} /></div></Shell>;
  }

  const byKind = (space.items ?? []).reduce<Record<string, typeof space.items>>((acc, it) => {
    (acc[it.kind] = acc[it.kind] ?? []).push(it);
    return acc;
  }, {});
  const pendingDrafts = (space as { drafts?: Draft[] }).drafts ?? [];
  const activity = (space as { activities?: SpaceActivity[] }).activities ?? [];

  return <Shell title={space.name}>
    <div className="content-page page-scroll">
      <PageHeader title={space.name} subtitle={space.description || 'No purpose set yet'} action={<>
        <Status tone={space.visibility === 'ROLE' ? 'blue' : 'gray'}>{space.visibility === 'ROLE' ? `Shared · ${space.ownerRole || 'team'}` : 'Private'}</Status>
        {space.status === 'ARCHIVED' && <Status tone="amber">Archived</Status>}
        <Link className="btn btn-primary" href={`/conversation?spaceId=${encodeURIComponent(space.id)}`}>Ask copilot about this space</Link>
        {space.status !== 'ARCHIVED' && <Button icon="download" variant="icon" title="Archive space" onClick={archiveSpace} disabled={archiving} />}
        <Button icon="close" variant="danger" title="Delete space" onClick={deleteSpace} />
      </>} />
      {space.status === 'ARCHIVED' && <div className="table-card" style={{ marginBottom: 14 }}><div className="table-subtitle">This space is archived — items are read-only.</div></div>}

      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Next actions</div><div className="table-subtitle">Derived from live data — nothing invented</div></div><Status tone={actions.length ? 'amber' : 'green'}>{actions.length} suggested</Status></div>
        <div className="job-list">{actions.length === 0 && <div className="table-subtitle">Nothing needs attention right now.</div>}
          {actions.map((a, i) => <div className="job-row" key={`${a.type}-${i}`}>
            <div className="job-main"><div className="job-icon"><Icon name={a.type === 'REVIEW_DRAFT' ? 'check' : a.type === 'FOLLOW_UP' ? 'chat' : 'grid'} /></div><div><div className="job-name">{a.title}</div><div className="job-agent">{a.reason}{a.requiresApproval ? ' · requires approval' : ''}</div></div></div>
            <div className="toolbar-actions"><Link className="btn btn-secondary" href={a.href}>Open</Link></div>
          </div>)}</div>
      </div>

      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Pending drafts</div><div className="table-subtitle">Attached to this space — decide in My inbox</div></div><Link className="btn btn-secondary" href="/inbox">Open inbox</Link></div>
        <div className="job-list">{pendingDrafts.length === 0 && <div className="table-subtitle">No drafts attached yet — create one from a conversation while this space is active.</div>}
          {pendingDrafts.map((d) => <div className="job-row" key={d.id}>
            <div className="job-main"><div className="job-icon"><Icon name="file" /></div><div><div className="job-name">{d.title}</div><div className="job-agent">{d.kind} · created by {d.createdBy ?? 'unknown'}</div></div></div>
            <div className="job-status"><Status tone={d.status === 'approved' ? 'green' : d.status === 'rejected' ? 'red' : d.status === 'in_review' ? 'blue' : 'gray'}>{d.status}</Status></div>
          </div>)}</div>
      </div>

      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Context items</div><div className="table-subtitle">Grouped by kind — the copilot reads these when this space is active</div></div></div>
        {Object.keys(byKind).length === 0 && <div className="table-subtitle">Nothing saved yet — use “Save to Space” from any conversation.</div>}
        {Object.entries(byKind).map(([kind, list]) => <div key={kind} style={{ marginTop: 8 }}>
          <div className="table-subtitle" style={{ textTransform: 'capitalize', fontWeight: 700 }}>{kind}s ({list.length})</div>
          <div className="job-list">{list.map((item) => {
            const href = KIND_LINK[item.kind]?.(item.refId, item.title);
            return <div className="job-row" key={item.id}>
              <div className="job-main"><div className="job-icon"><Icon name={KIND_ICON[item.kind] ?? 'grid'} /></div><div><div className="job-name">{item.title}</div><div className="job-agent">{(item.preview || '—').slice(0, 100)}{item.addedById ? ` · added by ${item.addedById}` : ''}{item.note ? ` · “${item.note}”` : ''}</div></div></div>
              <div className="toolbar-actions">
                {href ? <Link className="btn btn-ghost" href={href}>Open <Icon name="arrow" size={15} /></Link> : <span />}
                <Button icon="close" variant="icon" title="Remove from space" onClick={() => removeItem(item.id, item.title)} />
              </div>
            </div>;
          })}</div>
        </div>)}
      </div>

      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Quick note</div><div className="table-subtitle">Pin context for this goal</div></div><div className="toolbar-actions"><Button variant="primary" onClick={addNote} disabled={adding || !note.trim()}>Pin note</Button></div></div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Auckland closes 24 Nov — compliance review due Friday" />
      </div>

      <div className="table-card">
        <div className="table-toolbar"><div><div className="table-title">Activity timeline</div><div className="table-subtitle">Who did what, when — summaries only</div></div></div>
        <div className="job-list">{activity.length === 0 && <div className="table-subtitle">No activity recorded yet.</div>}
          {activity.slice(0, 20).map((a) => <div className="job-row" key={a.id}>
            <div className="job-main"><div className="job-icon"><Icon name="clock" /></div><div><div className="job-name">{a.summary}</div><div className="job-agent">{a.type} · {a.actorRole} · {a.actorId}</div></div></div>
            <div className="job-cell"><span>At</span>{new Date(a.createdAt).toLocaleString()}</div>
          </div>)}</div>
      </div>
    </div>
  </Shell>;
}
