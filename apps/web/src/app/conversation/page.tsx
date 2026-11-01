'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Composer, Icon, Input, Status, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { getSessionId, getSocket } from '@/lib/socket';
import { useToast } from '@/lib/store';
import { ASSISTANTS, buildDraftFromChat, mockChatAnswer, tenders, type ChatResponse, type Draft, type DraftKind } from '@street-smart/shared';

function draftTone(s: Draft['status']): 'gray' | 'blue' | 'green' | 'red' | 'amber' {
  if (s === 'approved') return 'green';
  if (s === 'rejected') return 'red';
  if (s === 'in_review') return 'blue';
  return 'gray';
}

function Body() {
  const search = useSearchParams();
  const initial = search.get('q') || '';
  const { toast } = useToast();
  const [started, setStarted] = useState(Boolean(initial));
  const [prompt, setPrompt] = useState('');
  const [question, setQuestion] = useState(initial);
  const [thinking, setThinking] = useState(false);
  const [sources, setSources] = useState(false);
  const [via, setVia] = useState<'mock' | 'http'>('mock');
  const [realtime, setRealtime] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string>('auto');
  const [answer, setAnswer] = useState<ChatResponse>(() => mockChatAnswer(initial));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);

  const ask = async (message: string) => {
    setPrompt('');
    setThinking(true);
    setStage(null);
    setRealtime(false);
    setQuestion(message);
    setStarted(true);
    setDraft(null);
    const activeAssistant = assistantId === 'auto' ? undefined : assistantId;
    const fallback = mockChatAnswer(message, activeAssistant);
    const apply = (res: ChatResponse & { tenders?: typeof tenders; via?: 'mock' | 'http' }) => {
      setVia(res.via ?? 'mock');
      if (res.assistantId) setAssistantId(res.assistantId);
      setAnswer({ answerTitle: res.answerTitle, answerCopy: res.answerCopy, tenderIds: res.tenderIds, recommendation: res.recommendation, sources: res.sources, followUps: res.followUps, assistantId: res.assistantId, skillsUsed: res.skillsUsed });
      setThinking(false);
      setStage(null);
    };
    // 1) Realtime Socket.IO (streams chat:stage progress + chat:answer). 2) POST fallback.
    try {
      const s = await getSocket(2500);
      if (s) {
        const onStage = (st: { stage: string }) => setStage(st.stage);
        const done = await new Promise<ChatResponse & { via?: 'mock' | 'http' } | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 70000);
          s.once('chat:answer', (res) => { clearTimeout(timer); resolve(res); });
          s.once('chat:error', () => { clearTimeout(timer); resolve(null); });
          s.on('chat:stage', onStage);
          s.emit('chat:message', { message, sessionId: getSessionId(), ...(activeAssistant ? { assistantId: activeAssistant } : {}) });
        });
        s.off('chat:stage', onStage);
        if (done) { setRealtime(true); apply(done); return; }
      }
    } catch { /* fall through to POST */ }
    const res = await api.post<(ChatResponse & { tenders?: typeof tenders; via?: 'mock' | 'http' })>(
      '/api/chat',
      activeAssistant ? { message, assistantId: activeAssistant, sessionId: getSessionId() } : { message, sessionId: getSessionId() },
      { ...fallback, via: 'mock' as const },
    );
    apply(res);
  };
  const send = () => { if (prompt.trim()) ask(prompt); };

  // AI drafts, humans decide. API failure → local draft (still editable).
  const newDraft = async (kind: DraftKind) => {
    const payload = {
      kind,
      title: answer.answerTitle || `Draft for: ${question.slice(0, 60)}`,
      body: [answer.answerCopy, answer.recommendation ? `Recommendation: ${answer.recommendation}` : ''].filter(Boolean).join('\n\n'),
      assistantId: answer.assistantId,
      skillsUsed: answer.skillsUsed ?? [],
      sources: answer.sources ?? [],
      tenderIds: answer.tenderIds ?? [],
    };
    const fallback = buildDraftFromChat(question || 'conversation', answer, kind);
    const created = await api.post<Draft>('/api/drafts', payload, fallback);
    setDraft(created);
    setDraftTitle(created.title);
    setDraftBody(created.body);
    toast(created.id.startsWith('local-') ? 'Local draft created (API offline) — still editable' : 'Draft created — please review & approve');
  };

  const saveEdits = async () => {
    if (!draft) return;
    setSaving(true);
    const fallback: Draft = { ...draft, title: draftTitle, body: draftBody, updatedAt: new Date().toISOString() };
    const updated = await api.patch<Draft>(`/api/drafts/${draft.id}`, { title: draftTitle, body: draftBody }, fallback);
    setDraft(updated);
    setSaving(false);
    toast('Draft edits saved');
  };

  const moveDraft = async (action: 'submit' | 'approve' | 'reject' | 'reopen') => {
    if (!draft) return;
    setSaving(true);
    const nextStatus = action === 'submit' ? 'in_review' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'draft';
    const fallback: Draft = { ...draft, status: nextStatus, updatedAt: new Date().toISOString() };
    const updated = await api.post<Draft>(`/api/drafts/${draft.id}/${action}`, { decidedBy: 'you' }, fallback);
    setDraft(updated);
    setDraftTitle(updated.title);
    setDraftBody(updated.body);
    setSaving(false);
    toast(action === 'approve' ? 'Draft approved — decision recorded under your name' : action === 'reject' ? 'Draft rejected — reopen & fix it' : action === 'submit' ? 'Draft submitted for review' : 'Draft reopened');
  };

  const shown = tenders.filter((t) => answer.tenderIds.includes(t.id)).slice(0, 3);
  const title = !started ? 'New conversation' : question.length > 64 ? `${question.slice(0, 64)}…` : question;

  // Tanya ke API saat halaman dibuka dengan ?q= — sebelumnya hanya mock lokal yang tampil.
  const askedRef = useRef(false);
  useEffect(() => {
    if (initial && !askedRef.current) {
      askedRef.current = true;
      ask(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = draft?.status === 'approved' || draft?.status === 'rejected';
  const activeAssistantName = ASSISTANTS.find((a) => a.id === (answer.assistantId ?? (assistantId === 'auto' ? 'sales-assistant' : assistantId)))?.name ?? 'Sales Assistant';
  const STAGE_ORDER = ['tenders', 'docs', 'ai'] as const;
  const STAGE_LABEL: Record<string, string> = { tenders: 'Searching tender database', docs: 'Reading relevant documents', ai: 'Generating answer' };
  const stageIdx = stage ? STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) : -1;
  return <div className="conversation-shell">
    <div className="conversation-header"><div><div className="conversation-title">{title}</div><div className="conversation-meta">{started ? `${activeAssistantName} · Updated just now` : 'Street Smart AI · Ready when you are'} · {via === 'http' ? 'Live AI' : 'Simulated answer'}{started && realtime ? ' · Realtime' : ''}</div>
      <select aria-label="Choose assistant" value={assistantId} onChange={(e) => setAssistantId(e.target.value)} style={{ marginTop: 8 }}>
        <option value="auto">Auto (match question)</option>
        {ASSISTANTS.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.tagline}</option>)}
      </select></div>
      {started && <div className="header-actions"><Button icon="grid" onClick={() => toast('Conversation saved to Tender Opportunity Review')}>Save to Space</Button><Button icon="more" variant="icon" title="More actions" onClick={() => toast('Conversation options opened')} /></div>}</div>
    {!started ? <div className="conversation-empty">
      <div className="ai-mark"><Icon name="spark" size={24} /></div>
      <div className="hero-title">Start a new conversation</div>
      <div className="hero-subtitle">Ask about tenders, sales, products, quotations, or operations.</div>
      <div className="empty-composer"><Composer value={prompt} setValue={setPrompt} onSend={send} /></div>
    </div> : <>
    <div className="conversation-feed">
      <div className="message-user"><div className="user-avatar">IN</div><div><div className="message-label">You</div><div className="user-bubble">{question}</div></div></div>
      {thinking ? <div className="thinking-card"><div className="ai-mark small"><Icon name="spark" /></div><div><div className="thinking-title">Analyzing your business data{realtime ? ' · live' : ''}</div><div className="thinking-steps">{STAGE_ORDER.map((key, i) => {
        const state = stageIdx < 0 ? (i === 0 ? 'active' : 'todo') : i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'todo';
        return state === 'done'
          ? <span key={key} className="done"><Icon name="check" size={14} />{STAGE_LABEL[key]}</span>
          : state === 'active'
            ? <span key={key} className="active"><span className="spinner" />{STAGE_LABEL[key]}</span>
            : <span key={key}>{STAGE_LABEL[key]}</span>;
      })}</div></div></div> :
      <div className="message-ai">
        <div className="ai-mark small"><Icon name="spark" /></div>
        <div className="ai-response">
          <div className="message-label">Street Smart AI <span className="agent-pill">{activeAssistantName}</span></div>
          <div className="answer-title">{answer.answerTitle}</div>
          <div className="answer-copy">{answer.answerCopy}</div>
          {shown.length > 0 && <div className="tender-cards">
            {shown.map((tender, index) => <div className="tender-card" key={tender.id}><div className="tender-rank">0{index + 1}</div><div className="tender-top"><div><div className="tender-name">{tender.name}</div><div className="tender-agency">{tender.agency}</div></div><Status tone={index < 2 ? 'amber' : 'gray'}>{index < 2 ? 'High priority' : 'Medium'}</Status></div><div className="tender-stats"><div><span>Estimated value</span><strong>{tender.value}</strong></div><div><span>Closes</span><strong>{tender.date}</strong></div><div><span>Product fit</span><strong>{tender.product}</strong></div></div><Link className="tender-link" href="/data">View opportunity <Icon name="arrow" size={15} /></Link></div>)}
          </div>}
          <div className="recommendation"><div className="recommendation-icon"><Icon name="spark" /></div><div><div className="recommendation-title">AI recommendation</div><div>{answer.recommendation}</div></div></div>
          <div className="action-row"><Link className="btn btn-primary" href="/data">Open tender pipeline</Link><Button onClick={() => newDraft('tender-brief')}>Prepare tender brief</Button><Button onClick={() => newDraft('approval-summary')}>Draft approval summary</Button></div>
          {draft && <div className="table-card" style={{ marginTop: 12 }}>
            <div className="table-toolbar"><div><div className="table-title">Draft — humans always decide</div><div className="table-subtitle">{draft.kind} · {draft.assistantId ?? 'ai'} · {draft.history.length} history entries</div></div><Status tone={draftTone(draft.status)}>{draft.status}</Status></div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}><span className="table-subtitle">Title (editable)</span><Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} disabled={locked || saving} /></label>
              <label style={{ display: 'grid', gap: 4 }}><span className="table-subtitle">Draft body (editable)</span><Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6} disabled={locked || saving} /></label>
              <div className="action-row">
                <Button variant="secondary" onClick={saveEdits} disabled={locked || saving}>{saving ? 'Saving…' : 'Save edits'}</Button>
                {draft.status === 'draft' && <Button variant="primary" onClick={() => moveDraft('submit')} disabled={saving}>Submit for review</Button>}
                {(draft.status === 'draft' || draft.status === 'in_review') && <><Button variant="primary" onClick={() => moveDraft('approve')} disabled={saving}>Approve</Button><Button variant="danger" onClick={() => moveDraft('reject')} disabled={saving}>Reject</Button></>}
                {draft.status === 'rejected' && <Button onClick={() => moveDraft('reopen')} disabled={saving}>Reopen & fix</Button>}
              </div>
              <div className="table-subtitle">Approvals/rejections are recorded ({draft.decidedBy ?? 'undecided'}). Approved/rejected drafts are locked — reopen to edit.</div>
            </div>
          </div>}
          <div className="sources">
            <button className="sources-toggle" onClick={() => setSources(!sources)}><Icon name="file" size={16} />Sources · {answer.sources.length} references<Icon name="chevron" size={16} /></button>
            {sources && <div className="sources-list">{answer.sources.map((s) => <div key={s.label}>{s.label} <span>{s.detail}</span></div>)}</div>}
          </div>
          <div className="followups"><div className="followup-label">Suggested follow-ups</div>{answer.followUps.map((item) => <Button key={item} variant="secondary" onClick={() => setPrompt(item)}>{item}</Button>)}</div>
        </div>
      </div>}
    </div>
    <div className="conversation-composer"><Composer value={prompt} setValue={setPrompt} onSend={send} compact /><div className="disclaimer">AI drafts content — humans always make the final call. Review before approving.</div></div>
    </>}
  </div>;
}

export default function ConversationPage() {
  return <Shell title="New conversation"><Suspense><Body /></Suspense></Shell>;
}
