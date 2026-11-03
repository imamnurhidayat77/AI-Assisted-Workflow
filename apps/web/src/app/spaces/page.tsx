'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Select, Status, Textarea, type IconName } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import { SPACE_TEMPLATES, type SpaceSummary } from '@street-smart/shared';

const TONES = ['amber', 'blue', 'green', 'purple'] as const;

export default function SpacesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tone, setTone] = useState<string>('blue');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'ROLE'>('PRIVATE');
  const [filter, setFilter] = useState<'active' | 'mine' | 'shared' | 'archived'>('active');

  const load = useCallback(async () => {
    const rows = await api.get<SpaceSummary[] | null>('/api/spaces', null);
    if (!rows) {
      setSpaces([]);
      setFailed(true);
      return;
    }
    setFailed(false);
    setSpaces(rows);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (templateId?: string) => {
    const tpl = SPACE_TEMPLATES.find((t) => t.id === templateId);
    const finalName = (tpl?.name ?? name).trim();
    if (!finalName) { toast('Name the space first'); return; }
    const created = await api.post<SpaceSummary | null>('/api/spaces', {
      name: finalName.slice(0, 80),
      description: (tpl?.purpose ?? desc).trim().slice(0, 500),
      tone: tone ?? 'blue',
      visibility: tpl?.visibility ?? visibility,
    }, null);
    if (!created) { toast('Could not save — sign in first or check the API'); return; }
    setName(''); setDesc(''); setCreating(false);
    await load();
    toast(`Space "${created.name}" created`);
    router.push(`/spaces/${created.id}`);
  };

  const iconFor = (icon: string): IconName => (['file', 'chart', 'grid', 'check', 'database', 'link'].includes(icon) ? (icon as IconName) : 'grid');

  const visible = useMemo(() => {
    const active = spaces.filter((s) => (s.status ?? 'ACTIVE') === 'ACTIVE');
    const archived = spaces.filter((s) => s.status === 'ARCHIVED');
    if (filter === 'archived') return archived;
    const pool = filter === 'active' ? active : active;
    if (filter === 'mine') return pool.filter((s) => user && s.ownerId === user.id);
    if (filter === 'shared') return pool.filter((s) => user && s.ownerId !== user.id);
    return pool;
  }, [spaces, filter, user]);

  return <Shell title="Spaces">
    <div className="content-page page-scroll"><PageHeader title="Spaces" subtitle={failed ? 'Database unreachable — no placeholder spaces shown.' : 'Copilot workspaces: context the assistant can read, with pending actions.'} action={<Button icon="plus" variant="primary" onClick={() => setCreating((v) => !v)}>Create Space</Button>} />
      <div className="action-row" role="group" aria-label="Space filter" style={{ marginBottom: 14 }}>
        <div className="segmented">
          {(['active', 'mine', 'shared', 'archived'] as const).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'mine' ? 'Mine' : f === 'shared' ? 'Shared with me' : f[0].toUpperCase() + f.slice(1)}</button>)}
        </div>
      </div>
      {creating && <div className="table-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Space name — e.g. Auckland Tender War Room" />
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="What is this space for?" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="table-subtitle">Visibility</span>
            <Select value={visibility} onChange={(v) => setVisibility(v === 'ROLE' ? 'ROLE' : 'PRIVATE')}><option value="PRIVATE">Private — only me</option><option value="ROLE">Shared — my role can view</option></Select>
          </div>
          <div className="action-row">{TONES.map((t) => <Button key={t} variant={tone === t ? 'primary' : 'secondary'} onClick={() => setTone(t)}>{t}</Button>)}</div>
          <div className="action-row"><Button variant="primary" onClick={() => create()}>Save space</Button><Button onClick={() => setCreating(false)}>Cancel</Button></div>
          <div className="table-subtitle">Or start from a template:</div>
          <div className="action-row">{SPACE_TEMPLATES.map((t) => <Button key={t.id} onClick={() => create(t.id)} title={t.purpose}>{t.name}</Button>)}</div>
        </div>
      </div>}
      {spaces.length === 0 && !failed && <div className="table-card" style={{ marginBottom: 14 }}>
        <div className="table-title">No spaces yet</div>
        <div className="table-subtitle">Spaces give the copilot shared context: save tenders, documents and conversations around one goal, review pending actions, and ask with the space attached. Start with a template above or create a blank one.</div>
      </div>}
      <div className="space-grid">{visible.map((s) =>
        <button className="space-card" key={s.id} onClick={() => router.push(`/spaces/${s.id}`)}>
          <div className={`space-art ${s.tone}`}><Icon name={iconFor(s.icon)} size={24} /></div>
          <div className="space-body">
            <div className="space-title">{s.name}</div>
            <div className="space-desc">{s.description || 'No purpose set'}</div>
            <div className="space-stats"><span>{s.itemCount} items</span><span>{Object.entries(s.byKind).map(([k, n]) => `${n} ${k}`).join(' · ') || 'empty'}</span></div>
            <div className="space-footer">
              <div className="avatar-stack"><Status tone={s.visibility === 'ROLE' ? 'blue' : 'gray'}>{s.visibility === 'ROLE' ? `shared · ${s.ownerRole || 'team'}` : 'private'}</Status></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {(s.pendingActions ?? 0) > 0 && <Status tone="amber">{s.pendingActions} to review</Status>}
                <span className="table-subtitle">{s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleDateString() : ''}</span>
                <Icon name="arrow" />
              </div>
            </div>
          </div>
        </button>)}
      </div>
      {visible.length === 0 && spaces.length > 0 && <div className="table-card"><div className="table-subtitle">Nothing in this view — try another filter.</div></div>}
    </div>
  </Shell>;
}
