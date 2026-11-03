'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Composer, Icon, Input, Status, Textarea } from '@/components/ui/primitives';
import { DocPreview } from '@/components/draft/DocPreview';
import { api, getStoredKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getSessionId, getSocket } from '@/lib/socket';
import { useToast } from '@/lib/store';
import { allowedAssistants, ASSISTANTS, canApproveDraft, canUseAssistant, parseDraftBody, renderDraftBody, resolveAssistant, serializeDraftBody, templateRefsFromSources, tenders, type ChatResponse, type Draft, type DraftKind, type DraftSection, type SpaceSummary, type SuggestedSpace } from '@street-smart/shared';

/** Editor terstruktur: tiap paragraf/bullet/sel tabel jadi field sendiri.
 * Jauh lebih mudah daripada satu textarea mentah. */
function DocEditor({ sections, onChange, disabled }: {
  sections: DraftSection[];
  onChange: (next: DraftSection[]) => void;
  disabled?: boolean;
}) {
  const set = (si: number, next: DraftSection) => onChange(sections.map((s, i) => (i === si ? next : s)));
  return <div className="doc-editor">
    {sections.map((s, si) => s.footer ? null : <div key={si} className="doc-section">
      {s.heading && <div className="table-subtitle" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.heading}</div>}
      {s.paragraphs.map((p, pi) => <Textarea key={pi} value={p} rows={2} disabled={disabled}
        onChange={(e) => set(si, { ...s, paragraphs: s.paragraphs.map((x, xi) => (xi === pi ? e.target.value : x)) })} />)}
      {s.bullets.map((b, bi) => <div key={bi} className="doc-bullet-edit"><span>•</span><Input value={b} disabled={disabled}
        onChange={(e) => set(si, { ...s, bullets: s.bullets.map((x, xi) => (xi === bi ? e.target.value : x)) })} /></div>)}
      {s.table && <div className="table-scroll"><table><thead><tr>{s.table.head.map((h, hi) => <th key={hi}><Input value={h} disabled={disabled}
        onChange={(e) => { const head = s.table!.head.slice(); head[hi] = e.target.value; set(si, { ...s, table: { head, rows: s.table!.rows } }); }} /></th>)}</tr></thead>
        <tbody>{s.table.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}><Input value={c} disabled={disabled}
          onChange={(e) => { const rows = s.table!.rows.map((rr) => rr.slice()); rows[ri][ci] = e.target.value; set(si, { ...s, table: { head: s.table!.head, rows } }); }} /></td>)}</tr>)}</tbody></table></div>}
    </div>)}
  </div>;
}

/** Jawaban "ditolak" — dipakai saat assistant di luar role user (server 403 atau offline). */
function deniedAnswer(assistantName: string, role: string): ChatResponse {
  return {
    answerTitle: 'Not available for your role',
    answerCopy: `The ${assistantName} serves a different team — you are signed in as ${role}, so this question was not answered. Pick one of your assistants above or rephrase within your scope.`,
    tenderIds: [],
    recommendation: 'Use the assistant dropdown to see exactly what your role may access.',
    sources: [],
    followUps: [],
  };
}

/** Jawaban error eksplisit saat API/DB mati — tanpa narasi simulasi yang mengarang. */
function offlineAnswer(): ChatResponse {
  return {
    answerTitle: 'Answer unavailable — API unreachable',
    answerCopy: 'The API or database could not be reached, so this question was not answered and nothing was saved. Check the connection and send again.',
    tenderIds: [],
    recommendation: '',
    sources: [],
    followUps: ['Retry now', 'Open Database explorer', 'Check System status'],
  };
}

/** Standardized source categories (PRD trust model): structured rows, document
 * evidence, or workflow records. Pure display helper. */
function sourceKind(label: string, detail: string): 'Structured data' | 'Document evidence' | 'Workflow record' | 'Reference' {
  const t = `${label} ${detail}`.toLowerCase();
  if (/part #\d+|\.pdf|\.xlsx|\.docx|\.csv|\.png|\.jpg|extraction|handbook/.test(t)) return 'Document evidence';
  if (/tender|invoice|sql|database|distributor|roster|checklist|policy|leave|job/.test(t)) return 'Structured data';
  if (/draft|space|approval|conversation/.test(t)) return 'Workflow record';
  return 'Reference';
}

function draftTone(s: Draft['status']): 'gray' | 'blue' | 'green' | 'red' | 'amber' {
  if (s === 'approved') return 'green';
  if (s === 'rejected') return 'red';
  if (s === 'in_review') return 'blue';
  return 'gray';
}

/** Assistant dropdown — opsi dibatasi ke role user (server tetap enforcement final). */
function AssistantPicker({ assistantId, setAssistantId }: { assistantId: string; setAssistantId: (v: string) => void }) {
  const { user, ready } = useAuth();
  const options = user ? allowedAssistants(user.role) : ASSISTANTS;
  useEffect(() => {
    if (ready && assistantId !== 'auto' && !options.some((a) => a.id === assistantId)) {
      setAssistantId('auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.role]);
  return <select aria-label="Choose assistant" value={assistantId} onChange={(e) => setAssistantId(e.target.value)} style={{ marginTop: 8 }}
    title={user ? `Signed in as ${user.name} (${user.role})` : 'Sign in via the profile menu'}>
    <option value="auto">Auto (my role's assistant)</option>
    {options.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.tagline}</option>)}
  </select>;
}

interface Turn {
  q: string;
  a: ChatResponse;
}

interface ThreadMsg {
  id: string;
  role: string;
  content: string;
  answer?: ChatResponse;
}

/** Compact rendering for older turns (latest turn keeps the full workspace UI).
 * Sengaja TANPA wrapper .conversation-feed — itu scroll-container flex:1; dipakai per-turn
 * membuat teks dan recommendation kepotong (bug: jawaban lama terklip). */
function PastTurn({ turn, initials }: { turn: Turn; initials: string }) {
  const cards = tenders.filter((t) => (turn.a.tenderIds ?? []).includes(t.id)).slice(0, 3);
  const name = ASSISTANTS.find((a) => a.id === turn.a.assistantId)?.name ?? 'Street Smart AI';
  return <>
    <div className="message-user"><div className="user-avatar">{initials}</div><div><div className="message-label">You</div><div className="user-bubble">{turn.q}</div></div></div>
    <div className="message-ai"><div className="ai-mark small"><Icon name="spark" /></div>
      <div className="ai-response">
        <div className="message-label">{name}</div>
        <div className="answer-title">{turn.a.answerTitle}</div>
        <div className="answer-copy">{turn.a.answerCopy}</div>
        {cards.length > 0 && <div className="tender-cards">
          {cards.map((tender, index) => <div className="tender-card" key={tender.id}><div className="tender-rank">0{index + 1}</div><div className="tender-top"><div><div className="tender-name">{tender.name}</div><div className="tender-agency">{tender.agency}</div></div></div><div className="tender-stats"><div><span>Estimated value</span><strong>{tender.value}</strong></div><div><span>Closes</span><strong>{tender.date}</strong></div><div><span>Product fit</span><strong>{tender.product}</strong></div></div></div>)}
        </div>}
        {turn.a.recommendation && <div className="recommendation"><div className="recommendation-icon"><Icon name="spark" /></div><div><div className="recommendation-title">AI recommendation</div><div>{turn.a.recommendation}</div></div></div>}
      </div>
    </div>
  </>;
}

function Body() {
  const search = useSearchParams();
  const router = useRouter();
  const { user: sessionUser } = useAuth();
  const initial = search.get('q') || '';
  const initialConv = search.get('c') || '';
  // Assistant dari @mention di Discover (?assistant=) — divalidasi lawan daftar role saat dipakai.
  const initialAssistant = search.get('assistant') || 'auto';
  // Space aktif (?spaceId=) — diverifikasi ke server; chip bisa dilepas kapan saja.
  const initialSpaceId = search.get('spaceId') || '';
  const { toast } = useToast();
  const [started, setStarted] = useState(Boolean(initial || initialConv));
  const [prompt, setPrompt] = useState('');
  const [question, setQuestion] = useState(initial);
  const [thinking, setThinking] = useState(false);
  const [sources, setSources] = useState(false);
  const [via, setVia] = useState<'mock' | 'http'>('mock');
  const [realtime, setRealtime] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string>(initialAssistant);
  const [convId, setConvId] = useState<string | null>(initialConv || null);
  const [past, setPast] = useState<Turn[]>([]);
  // State awal netral (bukan narasi mock) — terisi jawaban asli setelah ask() selesai.
  const [answer, setAnswer] = useState<ChatResponse>(() => ({
    answerTitle: initial ? 'Thinking…' : 'Start a new conversation',
    answerCopy: '',
    tenderIds: [],
    recommendation: '',
    sources: [],
    followUps: [],
  }));
  // Tandai bila sudah ada 1 exchange sungguhan — dipakai untuk memindahkan turn lama ke riwayat.
  const answeredRef = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [docPreview, setDocPreview] = useState(true);
  const [editSections, setEditSections] = useState<DraftSection[] | null>(null);
  const [saving, setSaving] = useState(false);
  // Draft terakhir bertahan antar-turn sebagai kartu ringkas (T8): satu klik ke review flow.
  const [linkedDraft, setLinkedDraft] = useState<Draft | null>(null);
  // Space aktif: konteks grounding + chip + saran simpan (dismissed per pertanyaan).
  const [spaceId, setSpaceId] = useState<string>(initialSpaceId);
  const [spaceName, setSpaceName] = useState('');
  const [suggested, setSuggested] = useState<{ space: SuggestedSpace; forQuestion: string } | null>(null);
  // Dismiss bertahan antar sesi via localStorage (bukan state in-memory saja).
  // Kunci = space + pertanyaan, jadi pesan yang sama tak ditawarkan ulang.
  const dismissedKey = (spaceId: string, q: string) => `${spaceId}::${q.slice(0, 120)}`;
  const [dismissedKeys, setDismissedKeys] = useState<string[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('suggested-space-dismissed') : null;
      return raw ? Object.keys(JSON.parse(raw) as Record<string, number>) : [];
    } catch {
      return [];
    }
  });
  const isDismissed = (spaceId: string, q: string) => dismissedKeys.includes(dismissedKey(spaceId, q));
  const markDismissed = (spaceId: string, q: string) => {
    const key = dismissedKey(spaceId, q);
    setDismissedKeys((prev) => (prev.includes(key) ? prev : [...prev.slice(-49), key]));
    try {
      const raw = localStorage.getItem('suggested-space-dismissed');
      const map = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
      map[key] = Date.now();
      const keys = Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, 50);
      const trimmed: Record<string, number> = {};
      for (const k of keys) trimmed[k] = map[k];
      localStorage.setItem('suggested-space-dismissed', JSON.stringify(trimmed));
    } catch {
      // abaikan — fallback ke state in-memory saja
    }
  };

  const ask = async (message: string) => {
    // Pindahkan turn aktif ke riwayat sebelum mulai yang baru (bukan pada pesan pertama).
    if (answeredRef.current && question) {
      const prev: Turn = { q: question, a: answer };
      setPast((p) => [...p, prev]);
    }
    setPrompt('');
    setThinking(true);
    setStage(null);
    setRealtime(false);
    setQuestion(message);
    setStarted(true);
    if (draft) setLinkedDraft(draft);
    setDraft(null);
    const activeAssistant = assistantId === 'auto' ? undefined : assistantId;
    // Fallback offline WAJIB konsisten role: resolve seperti server, tolak bila di luar role.
    // Tanpa ini, mock lokal bisa membocorkan jawaban lintas-role saat API mati.
    const roleGate = (() => {
      if (!sessionUser) return { denied: false, assistant: activeAssistant } as const;
      const resolved = resolveAssistant({ assistantId: activeAssistant, role: sessionUser.role, message });
      if (!canUseAssistant(sessionUser.role, resolved.id)) return { denied: true, assistant: resolved.id } as const;
      return { denied: false, assistant: resolved.id } as const;
    })();
    const roleName = sessionUser?.role ?? 'general';
    const deniedName = ASSISTANTS.find((a) => a.id === (roleGate.denied ? roleGate.assistant : activeAssistant))?.name ?? 'requested assistant';
    // Fallback HANYA untuk kasus offline/error: jawaban error eksplisit, bukan narasi simulasi.
    // Kasus denied tetap pesan akses (bukan data) — tidak mengarang isi jawaban.
    const fallback = roleGate.denied ? deniedAnswer(deniedName, roleName) : offlineAnswer();
    const showDenied = () => {
      setAnswer(deniedAnswer(deniedName, roleName));
      answeredRef.current = true;
      setThinking(false);
      setStage(null);
    };
    const apply = (res: ChatResponse & { tenders?: typeof tenders; via?: 'mock' | 'http'; conversationId?: string | null; spaceId?: string | null; suggestedSpace?: SuggestedSpace | null }) => {
      setVia(res.via ?? 'mock');
      if (res.assistantId) setAssistantId(res.assistantId);
      const full: ChatResponse = { answerTitle: res.answerTitle, answerCopy: res.answerCopy, tenderIds: res.tenderIds, recommendation: res.recommendation, sources: res.sources, followUps: res.followUps, assistantId: res.assistantId, skillsUsed: res.skillsUsed, actions: res.actions, suggestedSpace: res.suggestedSpace ?? undefined };
      if (res.suggestedSpace) setSuggested({ space: res.suggestedSpace, forQuestion: message });
      // Lanjutkan thread bila server mengembalikan id (persist aktif); tanpa id → mode sekali-jawab.
      if (res.conversationId) {
        setConvId(res.conversationId);
        try {
          router.replace(`/conversation?c=${encodeURIComponent(res.conversationId)}`);
        } catch { /* abaikan */ }
      }
      setAnswer(full);
      answeredRef.current = true;
      setThinking(false);
      setStage(null);
    };
    const cid = convId ?? undefined;
    // 1) Realtime Socket.IO (streams chat:stage progress + chat:answer). 2) POST fallback.
    try {
      const s = await getSocket(2500);
      if (s) {
        const onStage = (st: { stage: string }) => setStage(st.stage);
        const done = await new Promise<ChatResponse & { via?: 'mock' | 'http'; conversationId?: string | null } | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 70000);
          s.once('chat:answer', (res) => { clearTimeout(timer); resolve(res); });
          s.once('chat:error', () => { clearTimeout(timer); resolve(null); });
          s.on('chat:stage', onStage);
          s.emit('chat:message', { message, sessionId: getSessionId(), apiKey: getStoredKey(), ...(activeAssistant ? { assistantId: activeAssistant } : {}), ...(cid ? { conversationId: cid } : {}), ...(spaceId ? { spaceId } : {}) });
        });
        s.off('chat:stage', onStage);
        if (done) { setRealtime(true); apply(done); return; }
      }
    } catch { /* fall through to POST */ }
    // Direct fetch (bukan api.post): 403 role HARUS tampil sebagai denied,
    // bukan ditutup fallback mock. Error lain/offline → fallback konsisten-role di atas.
    try {
      const r = await fetch(`${api.base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getStoredKey() ? { 'X-API-Key': getStoredKey() } : {}) },
        body: JSON.stringify({ message, sessionId: getSessionId(), ...(activeAssistant ? { assistantId: activeAssistant } : {}), ...(cid ? { conversationId: cid } : {}), ...(spaceId ? { spaceId } : {}) }),
      });
      const json = (await r.json().catch(() => null)) as (ChatResponse & { tenders?: typeof tenders; via?: 'mock' | 'http'; conversationId?: string | null }) | null;
      if (r.ok && json) {
        apply(json);
        return;
      }
      if (r.status === 403) {
        showDenied();
        return;
      }
    } catch { /* offline → fallback di bawah */ }
    apply({ ...fallback, via: 'mock' as const });
  };
  const send = () => { if (prompt.trim()) ask(prompt); };

  // AI drafts, humans decide. Isi draft memakai template baku per kind
  // (renderDraftBody) dengan fakta dari kartu tender live. API failure → error eksplisit.
  const newDraft = async (kind: DraftKind) => {
    const factFor = (id: string): string => {
      const t = [...shown, ...tenders].find((x) => x.id === id);
      return t ? `${t.id} — ${t.name} (${t.agency}, ${t.value}, closes ${t.date}, ${t.status})` : id;
    };
    const payload = {
      kind,
      title: answer.answerTitle || `Draft for: ${question.slice(0, 60)}`,
      body: renderDraftBody(kind, {
        summary: answer.answerCopy,
        facts: (answer.tenderIds ?? []).map(factFor),
        recommendation: answer.recommendation,
        sources: answer.sources ?? [],
        assistantName: ASSISTANTS.find((a) => a.id === answer.assistantId)?.name,
        templateRefs: templateRefsFromSources(answer.sources),
      }),
      assistantId: answer.assistantId,
      skillsUsed: answer.skillsUsed ?? [],
      sources: answer.sources ?? [],
      tenderIds: answer.tenderIds ?? [],
      ...(spaceId ? { spaceId } : {}),
      // Tautan eksplisit ke thread asal (bukan tebakan) agar follow-up space akurat.
      ...(convId ? { sourceConversationId: convId } : {}),
    };
    const created = await api.post<Draft | null>('/api/drafts', payload, null);
    if (!created) {
      toast('Draft not saved — API/database unreachable. Check the connection and try again.');
      return;
    }
    setDraft(created);
    setDraftTitle(created.title);
    setDraftBody(created.body);
    setDocPreview(true);
    setEditSections(parseDraftBody(created.body));
    setLinkedDraft(created);
    toast('Draft created — please review & approve');
  };

  const saveEdits = async () => {
    if (!draft) return;
    setSaving(true);
    const body = editSections ? serializeDraftBody(editSections) : draftBody;
    setDraftBody(body);
    const fallback: Draft = { ...draft, title: draftTitle, body, updatedAt: new Date().toISOString() };
    const updated = await api.patch<Draft>(`/api/drafts/${draft.id}`, { title: draftTitle, body }, fallback);
    setDraft(updated);
    setEditSections(parseDraftBody(updated.body));
    setSaving(false);
    toast('Draft edits saved');
  };

  // decidedBy diambil dari sesi login (server, anti-spoofing) — bukan dari body.
  // Ganti user via menu profil di Shell. Tanpa login, API fallback ke 'you'.
  const moveDraft = async (action: 'submit' | 'approve' | 'reject' | 'reopen') => {
    if (!draft) return;
    setSaving(true);
    const nextStatus = action === 'submit' ? 'in_review' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'draft';
    const fallback: Draft = { ...draft, status: nextStatus, updatedAt: new Date().toISOString() };
    const updated = await api.post<Draft>(`/api/drafts/${draft.id}/${action}`, {}, fallback);
    setDraft(updated);
    setDraftTitle(updated.title);
    setDraftBody(updated.body);
    setEditSections(parseDraftBody(updated.body));
    setSaving(false);
    toast(action === 'approve' ? `Draft approved — recorded under ${updated.decidedBy ?? sessionUser?.name ?? 'you'}` : action === 'reject' ? 'Draft rejected — reopen & fix it' : action === 'submit' ? 'Draft submitted for review' : 'Draft reopened');
  };

  const shown = tenders.filter((t) => answer.tenderIds.includes(t.id)).slice(0, 3);
  const title = !started ? 'New conversation' : question.length > 64 ? `${question.slice(0, 64)}…` : question;

  // Save to Space — picker popover, lalu simpan Q&A ini sebagai item conversation.
  const [saveOpen, setSaveOpen] = useState(false);
  const [spaceList, setSpaceList] = useState<SpaceSummary[]>([]);
  const [savingSpace, setSavingSpace] = useState(false);
  const openSavePicker = async () => {
    setSaveOpen((v) => !v);
    const rows = await api.get<SpaceSummary[] | null>('/api/spaces', null);
    setSpaceList(rows ?? []);
    if (!rows) toast('Spaces failed to load — API/database unreachable');
  };
  const saveToSpace = async (spaceId: string, spaceName: string) => {
    setSavingSpace(true);
    const created = await api.post(`/api/spaces/${spaceId}/items`, {
      kind: 'conversation',
      refId: question,
      // sourceId eksplisit bila thread sudah tersimpan — untuk tautan follow-up.
      ...(convId ? { sourceId: convId } : {}),
      title: question.length > 120 ? `${question.slice(0, 120)}…` : question,
      preview: answer.answerTitle,
    }, null);
    setSavingSpace(false);
    setSaveOpen(false);
    toast(created ? `Saved to "${spaceName}"` : 'Could not save — sign in first or check the API');
  };

  // Verifikasi space aktif (?spaceId=): hanya yang boleh dilihat user.
  // Gagal → chip hilang + toast jujur (bukan konteks diam-diam).
  useEffect(() => {
    if (!initialSpaceId || !sessionUser) return;
    (async () => {
      try {
        const key = getStoredKey();
        const res = await fetch(`${api.base}/api/spaces/${encodeURIComponent(initialSpaceId)}`, { headers: key ? { 'X-API-Key': key } : {} });
        if (!res.ok) throw new Error(String(res.status));
        const s = (await res.json()) as { id: string; name: string };
        setSpaceId(s.id);
        setSpaceName(s.name);
      } catch {
        setSpaceId('');
        setSpaceName('');
        toast('Space context unavailable — continuing without it');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id]);

  // Simpan jawaban ke space yang disarankan (sekali klik, dismiss tersimpan).
  const saveSuggested = async () => {
    if (!suggested) return;
    const created = await api.post(`/api/spaces/${suggested.space.spaceId}/items`, {
      kind: 'conversation',
      refId: suggested.forQuestion.slice(0, 200),
      // sourceId eksplisit bila thread sudah ada — untuk tautan follow-up yang andal.
      ...(convId ? { sourceId: convId } : {}),
      title: suggested.forQuestion.slice(0, 120),
      preview: answer.answerTitle,
    }, null);
    if (created) {
      toast(`Saved to "${suggested.space.name}"`);
      markDismissed(suggested.space.spaceId, suggested.forQuestion);
      setSuggested(null);
    } else {
      toast('Could not save — sign in first or check the API');
    }
  };

  // Muat thread tersimpan (?c=) atau tanya baru (?q=) saat halaman dibuka.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    if (initialConv) {
      (async () => {
        try {
          const res = await fetch(`${api.base}/api/conversations/${encodeURIComponent(initialConv)}`, { headers: { 'X-API-Key': getStoredKey() } });
          if (!res.ok) return;
          const thread = (await res.json()) as { title: string; messages: ThreadMsg[]; assistantId?: string };
          const turns: Turn[] = [];
          let pendingQ = '';
          for (const m of thread.messages ?? []) {
            if (m.role === 'user') {
              // Pesan user tanpa balasan AI (mis. request terputus) dilepas —
              // jangan fabrikasi jawaban agar thread tidak berisi data karangan.
              pendingQ = m.content;
            } else if (m.role === 'assistant' && pendingQ) {
              turns.push({ q: pendingQ, a: (m as ThreadMsg & { answer?: ChatResponse }).answer ?? { answerTitle: '', answerCopy: m.content, tenderIds: [], recommendation: '', sources: [], followUps: [] } });
              pendingQ = '';
            }
          }
          if (turns.length) {
            const last = turns[turns.length - 1];
            setPast(turns.slice(0, -1));
            answeredRef.current = true;
            setStarted(true);
            setQuestion(last.q);
            setAnswer(last.a);
            if (last.a.assistantId) setAssistantId(last.a.assistantId);
          } else if (pendingQ) {
            // Thread hanya berisi pertanyaan tanpa jawaban (request terputus):
            // tampilkan pertanyaannya + saran kirim ulang, tanpa jawaban karangan.
            setPast([]);
            answeredRef.current = false;
            setStarted(true);
            setQuestion(pendingQ);
            setAnswer({ ...offlineAnswer(), answerTitle: 'Reply not saved — please resend' });
          }
          if (thread.assistantId) setAssistantId(thread.assistantId);
        } catch { /* fallback: tampilan kosong, user bisa tanya baru */ }
      })();
      return;
    }
    if (initial) ask(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = draft?.status === 'approved' || draft?.status === 'rejected';
  const initials = (sessionUser?.name ?? 'You').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const activeAssistantName = ASSISTANTS.find((a) => a.id === (answer.assistantId ?? (assistantId === 'auto' ? 'sales-assistant' : assistantId)))?.name ?? 'Sales Assistant';
  const STAGE_ORDER = ['tenders', 'docs', 'ai'] as const;
  const STAGE_LABEL: Record<string, string> = { tenders: 'Searching tender database', docs: 'Reading relevant documents', ai: 'Generating answer' };
  const stageIdx = stage ? STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) : -1;
  return <div className="conversation-shell">
    <div className="conversation-header"><div><div className="conversation-title">{title}</div><div className="conversation-meta">{started ? `${activeAssistantName} · Updated just now` : 'Street Smart AI · Ready when you are'} · {via === 'http' ? 'Live AI' : 'Built-in answers'}{started && realtime ? ' · Realtime' : ''}</div>
      <AssistantPicker assistantId={assistantId} setAssistantId={setAssistantId} />
        {spaceId && spaceName && <div style={{ marginTop: 6 }}><span className="agent-pill" title="Copilot memakai space ini sebagai konteks">📁 Context: {spaceName} <button onClick={() => { setSpaceId(''); setSpaceName(''); }} title="Remove space context" style={{ marginLeft: 6, fontWeight: 800 }}>×</button></span></div>}</div>
      {started && <div className="header-actions"><div className="notification-wrap"><Button icon="grid" onClick={openSavePicker}>Save to Space</Button>{saveOpen && <div className="notification-popover" style={{ width: 280, right: 0 }}><div className="popover-title">Save to Space{savingSpace ? ' — saving…' : ''}</div>{spaceList.map((s) => <button key={s.id} className="nav-item" style={{ width: '100%' }} onClick={() => saveToSpace(s.id, s.name)}><Icon name="grid" /><span>{s.name}</span></button>)}</div>}</div><Button icon="more" variant="icon" title="More actions" onClick={() => toast('Conversation options opened')} /></div>}</div>
    {!started ? <div className="conversation-empty">
      <div className="ai-mark"><Icon name="spark" size={24} /></div>
      <div className="hero-title">Start a new conversation</div>
      <div className="hero-subtitle">Ask about tenders, sales, products, quotations, or operations.</div>
      <div className="empty-composer"><Composer value={prompt} setValue={setPrompt} onSend={send} mentionOptions={(sessionUser ? allowedAssistants(sessionUser.role) : []).map((a) => ({ id: a.id, name: a.name, tagline: a.tagline }))} mentionValue={assistantId} onMention={setAssistantId} /></div>
    </div> : <>
    <div className="conversation-feed">
      {past.map((t, i) => <PastTurn key={i} turn={t} initials={initials} />)}
      <div className="message-user"><div className="user-avatar">{initials}</div><div><div className="message-label">You</div><div className="user-bubble">{question}</div></div></div>
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
          {answer.recommendation && <div className="recommendation"><div className="recommendation-icon"><Icon name="spark" /></div><div><div className="recommendation-title">AI recommendation</div><div>{answer.recommendation}</div></div></div>}
          {answer.actions && answer.actions.length > 0 && <div className="action-row">
            {answer.actions.map((a, i) => a.kind === 'draft' && a.draftKind
              ? <Button key={i} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => newDraft(a.draftKind!)}>{a.label}</Button>
              : <Link key={i} className={`btn ${i === 0 ? 'btn-primary' : 'btn-secondary'}`} href={a.href ?? '/'}>{a.label}</Link>)}
          </div>}
          {suggested && suggested.forQuestion === question && !isDismissed(suggested.space.spaceId, suggested.forQuestion) && (
            <div className="recommendation" role="status" aria-label="Suggested space">
              <div className="recommendation-icon"><Icon name="grid" size={18} /></div>
              <div style={{ flex: 1 }}>
                <div className="recommendation-title">Save to “{suggested.space.name}”?</div>
                <div>{suggested.space.reason}</div>
              </div>
              <div className="action-row" style={{ marginTop: 0 }}>
                <Button variant="primary" onClick={saveSuggested}>Save</Button>
                <Button variant="ghost" onClick={() => { markDismissed(suggested.space.spaceId, suggested.forQuestion); setSuggested(null); }}>Dismiss</Button>
              </div>
            </div>
          )}
          {draft && (() => {
            // Tombol mengikuti peran: maker (pemilik) hanya edit + submit/withdraw,
            // checker (ops/mgmt bukan pembuat, lolos maker-checker) yang approve/reject.
            // Server tetap enforcement final — UI tidak pernah melonggarkan.
            const isOwner = !sessionUser || !draft.createdBy || draft.createdBy === sessionUser.id;
            const canDecide = sessionUser ? canApproveDraft(draft, { id: sessionUser.id, role: sessionUser.role }) : false;
            const canEdit = !locked && (!sessionUser || isOwner || sessionUser.role === 'management');
            const isMaker = sessionUser && isOwner && draft.createdBy === sessionUser.id;
            return <div className="table-card" style={{ marginTop: 12 }}>
            <div className="table-toolbar"><div className="doc-card-head"><span className="doc-card-icon"><Icon name="file" size={18} /></span><div><div className="table-title">{draft.kind.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')}</div><div className="table-subtitle">{draft.assistantId ?? 'ai'} · {draft.history.length} history entries</div></div></div><div className="toolbar-actions">{canEdit && <div className="segmented" role="group" aria-label="Draft view"><button className={docPreview ? 'on' : ''} onClick={() => setDocPreview(true)}>Preview</button><button className={!docPreview ? 'on' : ''} onClick={() => { setEditSections(parseDraftBody(draftBody)); setDocPreview(false); }}>Edit</button></div>}<Status tone={draftTone(draft.status)}>{draft.status}</Status></div></div>
            {docPreview || !canEdit ? <DocPreview body={draftBody} /> : <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}><span className="table-subtitle">Title (editable)</span><Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} disabled={locked || saving} /></label>
              {editSections && <DocEditor sections={editSections} onChange={setEditSections} disabled={locked || saving} />}
            </div>}
            <div style={{ display: 'grid', gap: 8, marginTop: docPreview ? 12 : 0 }}>
              <div className="table-subtitle">Decide as {sessionUser ? `${sessionUser.name} (${sessionUser.role})` : 'you (login via profile menu)'} — recorded in audit.</div>
              <div className="action-row">
                {canEdit && <Button variant="secondary" onClick={saveEdits} disabled={locked || saving}>{saving ? 'Saving…' : 'Save edits'}</Button>}
                {draft.status === 'draft' && isOwner && <Button variant="primary" onClick={() => moveDraft('submit')} disabled={saving}>Submit for review</Button>}
                {(draft.status === 'draft' || draft.status === 'in_review') && canDecide && <><Button variant="primary" onClick={() => moveDraft('approve')} disabled={saving}>Approve</Button><Button variant="danger" onClick={() => moveDraft('reject')} disabled={saving}>Reject</Button></>}
                {draft.status === 'in_review' && isMaker && !canDecide && <Button variant="danger" onClick={() => moveDraft('reject')} disabled={saving}>Withdraw</Button>}
                {draft.status === 'rejected' && isOwner && <Button onClick={() => moveDraft('reopen')} disabled={saving}>Reopen & fix</Button>}
              </div>
              <div className="table-subtitle">Approvals/rejections are recorded ({draft.decidedBy ?? 'undecided'}). Approved/rejected drafts are locked — reopen to edit.</div>
            </div>
          </div>; })()}
          {answer.sources.length > 0 && <div className="sources">
            <button className="sources-toggle" onClick={() => setSources(!sources)}><Icon name="file" size={16} />Sources · {answer.sources.length} reference{answer.sources.length === 1 ? '' : 's'}<Icon name="chevron" size={16} /></button>
            {sources && <div className="sources-list">{answer.sources.map((s) => <div key={s.label}><span className="source-kind">{sourceKind(s.label, s.detail)}</span>{s.label} <span>{s.detail}</span></div>)}</div>}
          </div>}
          {answer.followUps.length > 0 && <div className="followups"><div className="followup-label">Suggested follow-ups</div>{answer.followUps.map((item) => <Button key={item} variant="secondary" onClick={() => setPrompt(item)}>{item}</Button>)}</div>}
          {linkedDraft && (!draft || linkedDraft.id !== draft.id) && <Link className="draft-chip" href="/inbox"><Icon name="file" size={15} /><span><strong>{linkedDraft.title}</strong><small>{linkedDraft.kind} · {linkedDraft.status}</small></span><Status tone={draftTone(linkedDraft.status)}>{linkedDraft.status}</Status><span className="draft-chip-go">Review <Icon name="arrow" size={13} /></span></Link>}
        </div>
      </div>}
    </div>
    <div className="conversation-composer"><Composer value={prompt} setValue={setPrompt} onSend={send} compact mentionOptions={(sessionUser ? allowedAssistants(sessionUser.role) : []).map((a) => ({ id: a.id, name: a.name, tagline: a.tagline }))} mentionValue={assistantId} onMention={setAssistantId} /><div className="disclaimer">AI drafts content — humans always make the final call. Review before approving.</div></div>
    </>}
  </div>;
}

export default function ConversationPage() {
  return <Shell title="New conversation"><Suspense><Body /></Suspense></Shell>;
}
