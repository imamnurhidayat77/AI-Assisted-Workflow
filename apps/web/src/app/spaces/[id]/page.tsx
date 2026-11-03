'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Status, Textarea, type IconName } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/lib/store';
import type { SpaceDetail } from '@street-smart/shared';

const KIND_ICON: Record<string, IconName> = { conversation: 'chat', document: 'file', tender: 'database', note: 'grid' };
const KIND_LINK: Record<string, (refId: string, title: string) => string | null> = {
  conversation: (_r, t) => `/conversation?q=${encodeURIComponent(t)}`,
  document: () => '/documents',
  tender: (r) => (r ? `/data` : null),
  note: () => null,
};

export default function SpaceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api.base}/api/spaces/${params.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setSpace(await res.json());
    } catch {
      setSpace(null);
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
    const res = await api.del<{ ok: boolean } | null>(`/api/spaces/${params.id}/items/${itemId}`, null);
    if (!res?.ok) { toast('Could not remove — sign in first'); return; }
    toast(`Removed "${title}"`);
    await load();
  };

  const deleteSpace = async () => {
    if (!space || !confirm(`Delete space "${space.name}" and all its items?`)) return;
    const res = await api.del<{ ok: boolean } | null>(`/api/spaces/${space.id}`, null);
    if (!res?.ok) { toast('Could not delete — sign in first'); return; }
    toast('Space deleted');
    router.push('/spaces');
  };

  if (space === null) {
    return <Shell title="Space"><div className="content-page page-scroll"><PageHeader title="Space not found" subtitle="The API may be offline." action={<Link className="btn btn-secondary" href="/spaces">Back to Spaces</Link>} /></div></Shell>;
  }

  return <Shell title={space.name}>
    <div className="content-page page-scroll">
      <PageHeader title={space.name} subtitle={space.description || 'No description'} action={<><Button icon="grid" onClick={() => router.push('/spaces')}>All spaces</Button><Button icon="close" variant="danger" onClick={deleteSpace}>Delete</Button></>} />
      <div className="summary-row">
        <div className="summary-card"><span>Total items</span><strong>{space.items.length}</strong><small>saved to this space</small></div>
        <div className="summary-card"><span>Conversations</span><strong>{space.items.filter((i) => i.kind === 'conversation').length}</strong><small>AI threads</small></div>
        <div className="summary-card"><span>Documents & tenders</span><strong>{space.items.filter((i) => i.kind !== 'conversation' && i.kind !== 'note').length}</strong><small>linked records</small></div>
      </div>
      <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-toolbar"><div><div className="table-title">Quick note</div><div className="table-subtitle">Pin context for this goal</div></div><div className="toolbar-actions"><Button variant="primary" onClick={addNote} disabled={adding || !note.trim()}>Pin note</Button></div></div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Auckland closes 24 Nov — compliance review due Friday" />
      </div>
      <div className="table-card">
        <div className="table-toolbar"><div><div className="table-title">Saved items</div><div className="table-subtitle">{space.items.length} items · newest first</div></div></div>
        <div className="job-list">{space.items.length === 0 && <div className="table-subtitle">Nothing saved yet — use “Save to Space” from any conversation.</div>}
          {space.items.map((item) => {
            const href = KIND_LINK[item.kind]?.(item.refId, item.title);
            return <div className="job-row" key={item.id}>
              <div className="job-main"><div className="job-icon"><Icon name={KIND_ICON[item.kind] ?? 'grid'} /></div><div><div className="job-name">{item.title}</div><div className="job-agent">{new Date(item.createdAt).toLocaleString()}</div></div></div>
              <div className="job-cell"><span>Kind</span>{item.kind}</div>
              <div className="job-cell"><span>Detail</span>{(item.preview || '—').slice(0, 80)}</div>
              <div className="job-status"><Status tone={item.kind === 'conversation' ? 'blue' : item.kind === 'tender' ? 'amber' : 'gray'}>{item.kind}</Status></div>
              {href ? <Link className="btn btn-ghost" href={href}>Open <Icon name="arrow" size={15} /></Link> : <span />}
              <Button icon="close" variant="icon" title="Remove from space" onClick={() => removeItem(item.id, item.title)} />
            </div>;
          })}
        </div>
      </div>
    </div>
  </Shell>;
}
