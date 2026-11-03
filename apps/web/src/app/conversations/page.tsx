'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
interface Row {
  id?: string; // ada = thread DB (buka ?c=)
  title: string;
  preview: string;
  date: string;
  assistantId?: string;
}

export default function ConversationsPage() {
  const router = useRouter();
  // Tanpa riwayat palsu: mulai kosong, isi dari DB milik sendiri.
  const [rows, setRows] = useState<Row[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // DB milik sendiri (server filter owner); gagal → daftar kosong + penanda error.
      const live = await api.get<Row[] | null>('/api/conversations', null);
      if (!alive) return;
      if (!live) {
        setFailed(true);
        return;
      }
      setRows(live.map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.preview || r.assistantId || '',
        date: r.date,
        assistantId: r.assistantId,
      })));
    })();
    return () => { alive = false; };
  }, []);

  return <Shell title="Conversations">
    <div className="content-page page-scroll"><PageHeader title="Conversations" subtitle={failed ? 'Database unreachable — no placeholder history shown.' : 'Your copilot threads — continue recent work.'} action={<Button icon="plus" variant="primary" onClick={() => router.push('/conversation?new=1')}>New conversation</Button>} />
      <div className="conversation-list">{rows.length === 0 && !failed
        ? <div className="table-subtitle">No conversations yet — start a new one.</div>
        : rows.map((c, i) =>
        <button className="conversation-row" key={c.id ?? `${c.title}-${i}`} onClick={() => router.push(c.id ? `/conversation?c=${encodeURIComponent(c.id)}` : `/conversation?q=${encodeURIComponent(c.title)}`)}>
          <div className="activity-icon"><Icon name="chat" /></div>
          <div><div className="conversation-row-title">{c.title}</div><div className="conversation-row-copy">{c.preview}</div></div>
          <span>{c.date}</span><Icon name="chevron" />
        </button>)}
      </div>
    </div>
  </Shell>;
}
