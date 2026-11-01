'use client';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader } from '@/components/ui/primitives';
import { conversationHistory } from '@street-smart/shared';

export default function ConversationsPage() {
  const router = useRouter();
  return <Shell title="Conversations">
    <div className="content-page page-scroll"><PageHeader title="Conversations" subtitle="Continue recent work with Street Smart AI." action={<Button icon="plus" variant="primary" onClick={() => router.push('/conversation?new=1')}>New conversation</Button>} />
      <div className="conversation-list">{conversationHistory.map((c) =>
        <button className="conversation-row" key={c.title} onClick={() => router.push(`/conversation?q=${encodeURIComponent(c.title)}`)}>
          <div className="activity-icon"><Icon name="chat" /></div>
          <div><div className="conversation-row-title">{c.title}</div><div className="conversation-row-copy">{c.preview}</div></div>
          <span>{c.date}</span><Icon name="chevron" />
        </button>)}
      </div>
    </div>
  </Shell>;
}
