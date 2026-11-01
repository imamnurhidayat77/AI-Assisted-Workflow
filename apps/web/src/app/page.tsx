'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Composer, Icon } from '@/components/ui/primitives';
import { prompts } from '@street-smart/shared';

export default function DiscoverPage() {
  const [prompt, setPrompt] = useState('');
  const router = useRouter();
  const open = (p: string) => router.push(`/conversation?q=${encodeURIComponent(p)}`);

  return <Shell title="Discover">
    <div className="discover page-scroll">
      <div className="hero">
        <div className="ai-mark"><Icon name="spark" size={24} /></div>
        <div className="hero-title">What can I help you with?</div>
        <div className="hero-subtitle">Ask about tenders, sales, products, quotations, or operations.</div>
        <Composer value={prompt} setValue={setPrompt} onSend={() => prompt.trim() && open(prompt)} />
        <div className="prompt-grid">
          {prompts.slice(0, 3).map((item) => <button className="prompt-chip" key={item} onClick={() => open(item)}><span>{item}</span><Icon name="arrow" size={15} /></button>)}
        </div>
        <div className="hero-footnote"><span /> Using simulated Street Smart business data</div>
      </div>
    </div>
  </Shell>;
}
