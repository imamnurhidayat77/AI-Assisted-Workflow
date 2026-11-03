'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Composer, Icon } from '@/components/ui/primitives';
import { allowedAssistants, prompts } from '@street-smart/shared';
import { useAuth } from '@/lib/auth';

export default function DiscoverPage() {
  const [prompt, setPrompt] = useState('');
  const [mentionAssistant, setMentionAssistant] = useState('auto');
  const router = useRouter();
  const { user } = useAuth();
  const open = (p: string) => {
    const base = `/conversation?q=${encodeURIComponent(p)}`;
    router.push(mentionAssistant !== 'auto' ? `${base}&assistant=${encodeURIComponent(mentionAssistant)}` : base);
  };

  return <Shell title="Discover">
    <div className="discover page-scroll">
      <div className="hero">
        <div className="ai-mark"><Icon name="spark" size={24} /></div>
        <div className="hero-title">What can I help you with?</div>
        <div className="hero-subtitle">Ask about company data, documents, approvals, finance, HR, sales, and operations.</div>
        <Composer value={prompt} setValue={setPrompt} onSend={() => prompt.trim() && open(prompt)}
          mentionOptions={(user ? allowedAssistants(user.role) : []).map((a) => ({ id: a.id, name: a.name, tagline: a.tagline }))}
          mentionValue={mentionAssistant} onMention={setMentionAssistant} />
        <div className="prompt-grid">
          {prompts.slice(0, 3).map((item) => <button className="prompt-chip" key={item} onClick={() => open(item)}><span>{item}</span><Icon name="arrow" size={15} /></button>)}
        </div>
        <div className="hero-footnote"><span /> Seeded synthetic company data — no real customer records</div>
      </div>
    </div>
  </Shell>;
}
