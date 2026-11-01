'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useToast } from '@/lib/store';
import { draftKindForExtraction, extractionNeedsReview, type DocumentExtraction, type Draft } from '@street-smart/shared';

interface DocItem { id: string; fileName: string; sizeLabel: string; status: string; createdAt: string; }

const FALLBACK_DOCS: DocItem[] = [
  { id: 'seed-1', fileName: 'NZTA_Tender_2026.pdf', sizeLabel: '4.8 MB', status: 'Processed', createdAt: new Date().toISOString() },
  { id: 'seed-2', fileName: 'Distributor_Sales_Q3.xlsx', sizeLabel: '2.1 MB', status: 'Processing', createdAt: new Date().toISOString() },
  { id: 'seed-3', fileName: 'Smartstud_Quotation_1042.pdf', sizeLabel: '860 KB', status: 'Completed', createdAt: new Date().toISOString() },
];

function sourceTone(s: string): 'green' | 'amber' | 'gray' {
  if (s === 'extracted') return 'green';
  if (s === 'inferred') return 'amber';
  return 'gray';
}

export default function DocumentsPage() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocItem[]>(FALLBACK_DOCS);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<DocItem | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createdDraft, setCreatedDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const rows = await api.get<DocItem[]>('/api/documents', FALLBACK_DOCS);
    setDocs(rows);
    return rows;
  }, []);

  useEffect(() => { load(); }, [load]);

  // Polling ringan selama masih ada dokumen Processing
  useEffect(() => {
    if (!docs.some((d) => d.status === 'Processing')) return;
    const t = setInterval(() => { load(); }, 4000);
    return () => clearInterval(t);
  }, [docs, load]);

  const uploadFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(list).forEach((f) => form.append('files', f));
      const res = await fetch(`${api.base}/api/documents/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as DocItem[];
      toast(`${created.length} dokumen masuk antrean — ekstraksi berjalan`);
      await load();
    } catch {
      // Fallback lokal bila API mati: tampilkan sebagai Processing
      setDocs((cur) => [...cur, ...Array.from(list).map((f, i) => ({
        id: `local-${Date.now()}-${i}`, fileName: f.name,
        sizeLabel: f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`,
        status: 'Processing', createdAt: new Date().toISOString(),
      }))]);
      toast('API tidak terjangkau — ditampilkan lokal (simulasi)');
    } finally {
      setUploading(false);
    }
  };

  const viewExtract = async (doc: DocItem) => {
    setSelected(doc);
    setEdited({});
    setCreatedDraft(null);
    try {
      const res = await fetch(`${api.base}/api/documents/${doc.id}/extract`);
      if (!res.ok) throw new Error('nf');
      const json = await res.json();
      setExtraction(json.extraction as DocumentExtraction);
    } catch {
      setExtraction(null);
      toast(`Preview ekstraksi ${doc.fileName} (simulasi)`);
    }
  };

  const removeDoc = async (doc: DocItem) => {
    try {
      await fetch(`${api.base}/api/documents/${doc.id}`, { method: 'DELETE' });
      if (selected?.id === doc.id) { setSelected(null); setExtraction(null); setEdited({}); setCreatedDraft(null); }
      await load();
      toast(`${doc.fileName} deleted`);
    } catch {
      setDocs((cur) => cur.filter((d) => d.id !== doc.id));
    }
  };

  // Manusia perbaiki nilai field, lalu jadikan draft — keputusan final tetap di flow approve.
  const makeDraft = async () => {
    if (!selected || !extraction) return;
    setCreating(true);
    const lines = extraction.fields.map((f) => `- ${f.label}: ${edited[f.label] ?? f.value}`);
    if (extraction.missingFields.length) lines.push(`\nStill incomplete: ${extraction.missingFields.join(', ')} — needs human completion.`);
    const payload = {
      kind: draftKindForExtraction(extraction.kind),
      title: `${extraction.kind}: ${selected.fileName}`,
      body: [`Hasil review ${selected.fileName} (${extraction.kind}):`, ...lines].join('\n'),
      skillsUsed: ['doc-extract-status'],
      sources: [{ label: selected.fileName, detail: extraction.kind }],
      sourceDocumentId: selected.id,
      sourceDocumentName: selected.fileName,
    };
    const fallback: Draft = {
      id: `local-${Date.now()}`, kind: payload.kind, title: payload.title, body: payload.body,
      status: 'draft', skillsUsed: payload.skillsUsed, sources: payload.sources,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      history: [{ at: new Date().toISOString(), actor: 'human', action: 'created' }],
    };
    const d = await api.post<Draft>('/api/drafts', payload, fallback);
    setCreatedDraft(d);
    setCreating(false);
    toast(d.id.startsWith('local-') ? 'Local draft created — approve in /conversation' : 'Draft created — continue approval in the draft flow');
  };

  const needsReview = extraction ? extractionNeedsReview(extraction) : false;

  return <Shell title="Document ingestion">
    <div className="content-page page-scroll"><PageHeader title="Document ingestion" subtitle="Upload and process business documents for AI-powered search and analysis." />
      <div className="document-layout">
        <div className="table-card upload-card">
          <label className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}>
            <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx" onChange={(e) => uploadFiles(e.target.files)} />
            <div className="upload-symbol"><Icon name="upload" size={26} /></div>
            <div className="drop-title">{uploading ? 'Uploading…' : 'Drop business documents here'}</div>
            <div className="drop-copy">Tender PDFs, sales spreadsheets, quotations, and other records</div>
            <span className="btn btn-primary">Browse files</span>
            <div className="drop-meta">PDF, XLSX, XLS, CSV, DOCX · Maximum 50 MB</div>
          </label>
          <div className="queue-header"><div><div className="table-title">Processing queue</div><div className="table-subtitle">{docs.length} files · stored in database</div></div></div>
          <div className="file-list">{docs.map((d) => <div className="file-row" key={d.id}>
            <div className="file-icon"><Icon name="file" /></div>
            <div className="file-main"><div className="file-name">{d.fileName}</div><div className="file-meta">{d.sizeLabel} · {new Date(d.createdAt).toLocaleDateString()}</div>{d.status === 'Processing' && <div className="file-progress"><i /></div>}</div>
            <Status tone={d.status === 'Processing' ? 'blue' : 'green'}>{d.status}</Status>
            <Button icon="eye" variant="icon" title="View extracted data" onClick={() => viewExtract(d)} />
            <Button icon="close" variant="icon" title="Delete document" onClick={() => removeDoc(d)} />
          </div>)}</div>
        </div>
        <div className="table-card extraction-preview"><div className="preview-graphic"><Icon name="spark" size={30} /></div>
          {selected && extraction ? <>
            <div className="table-title">{extraction.kind}</div>
            <div className="preview-copy">{selected.fileName} · confidence {Math.round(extraction.confidence * 100)}% {needsReview && '· needs human verification'}</div>
            {extraction.fields.map((f) => <div className="preview-stat" key={f.label}>
              <span>{f.label} <Status tone={sourceTone(f.source)}>{f.source}</Status> {f.needsReview && <Status tone="amber">{Math.round(f.confidence * 100)}% check</Status>}</span>
              <Input value={edited[f.label] ?? f.value} onChange={(e) => setEdited((cur) => ({ ...cur, [f.label]: e.target.value }))} aria-label={f.label} />
            </div>)}
            {extraction.missingFields.length > 0 && <div className="preview-stat"><span>Still incomplete</span><strong>{extraction.missingFields.join(', ')}</strong></div>}
            <div className="action-row" style={{ marginTop: 8 }}>
              <Button variant="primary" onClick={makeDraft} disabled={creating}>{creating ? 'Creating…' : 'Create draft from this'}</Button>
              {createdDraft && <Link className="btn btn-secondary" href="/conversation">Continue to approve</Link>}
            </div>
            {createdDraft && <div className="table-subtitle">Draft {createdDraft.id.slice(0, 8)} · {createdDraft.status} — final decision stays with humans.</div>}
          </> : <>
            <div className="table-title">AI-ready knowledge</div>
            <div className="preview-copy">Processed files become searchable in Street Smart AI and are linked to relevant business records. Click the eye icon on a file to see its extraction result.</div>
            <div className="preview-stat"><span>Documents indexed</span><strong>{docs.filter((d) => d.status !== 'Processing').length}</strong></div>
            <div className="preview-stat"><span>Extraction accuracy</span><strong>94.0%</strong></div>
          </>}
        </div>
      </div>
    </div>
  </Shell>;
}
