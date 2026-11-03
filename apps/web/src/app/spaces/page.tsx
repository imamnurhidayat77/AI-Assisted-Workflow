'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Textarea, type IconName } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/lib/store';
import type { SpaceSummary } from '@street-smart/shared';

const TONES = ['amber', 'blue', 'green', 'purple'] as const;

export default function SpacesPage() {
  const { toast } = useToast();
  const router = useRouter();
  // Tanpa space palsu: mulai kosong, isi dari DB; gagal → penanda error.
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tone, setTone] = useState<string>('blue');

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

  const create = async () => {
    if (!name.trim()) { toast('Name the space first'); return; }
    const created = await api.post<SpaceSummary | null>('/api/spaces', { name: name.trim(), description: desc.trim(), tone }, null);
    if (!created) { toast('Could not save — sign in first or check the API'); return; }
    setName(''); setDesc(''); setCreating(false);
    await load();
    toast(`Space "${created.name}" created`);
    router.push(`/spaces/${created.id}`);
  };

  const openSpace = (id: string) => {
    router.push(`/spaces/${id}`);
  };

  const iconFor = (icon: string): IconName => (['file', 'chart', 'grid', 'check', 'database', 'link'].includes(icon) ? (icon as IconName) : 'grid');

  return <Shell title="Spaces">
    <div className="content-page page-scroll"><PageHeader title="Spaces" subtitle={failed ? 'Database tidak terjangkau — tidak ada space palsu yang ditampilkan.' : 'Persistent workspaces organized around your business goals.'} action={<Button icon="plus" variant="primary" onClick={() => setCreating((v) => !v)}>Create Space</Button>} />
      {creating && <div className="table-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Space name — e.g. Auckland Tender War Room" />
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="What is this space for?" />
          <div className="action-row">{TONES.map((t) => <Button key={t} variant={tone === t ? 'primary' : 'secondary'} onClick={() => setTone(t)}>{t}</Button>)}</div>
          <div className="action-row"><Button variant="primary" onClick={create}>Save space</Button><Button onClick={() => setCreating(false)}>Cancel</Button></div>
        </div>
      </div>}
      <div className="space-grid">{spaces.map((s) =>
        <button className="space-card" key={s.id} onClick={() => openSpace(s.id)}>
          <div className={`space-art ${s.tone}`}><Icon name={iconFor(s.icon)} size={24} /></div>
          <div className="space-body"><div className="space-title">{s.name}</div><div className="space-desc">{s.description}</div><div className="space-stats"><span>{s.itemCount} items</span><span>{Object.entries(s.byKind).map(([k, n]) => `${n} ${k}`).join(' · ') || 'empty'}</span></div>
          <div className="space-footer"><div className="avatar-stack"><span>IN</span><span>SM</span><span>+2</span></div><Icon name="arrow" /></div></div>
        </button>)}
      </div>
    </div>
  </Shell>;
}
