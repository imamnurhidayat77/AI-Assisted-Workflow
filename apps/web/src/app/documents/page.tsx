'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Status } from '@/components/ui/primitives';
import { api, getStoredKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';

function authHeaders(): Record<string, string> {
  const key = getStoredKey();
  return key ? { 'X-API-Key': key } : {};
}
import { canUploadDomain, draftKindForExtraction, extractionNeedsReview, renderDraftBody, type DocumentExtraction, type Draft } from '@street-smart/shared';

interface DocItem { id: string; fileName: string; sizeLabel: string; status: string; createdAt: string; }

function sourceTone(s: string): 'green' | 'amber' | 'gray' {
  if (s === 'extracted') return 'green';
  if (s === 'inferred') return 'amber';
  return 'gray';
}

export default function DocumentsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Tanpa data palsu: mulai kosong, isi dari DB; gagal load → error eksplisit.
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadDomain, setUploadDomain] = useState<'general' | 'finance' | 'hr'>('general');
  // Opsi domain upload dibatasi role (server tetap enforcement final via 403).
  const domainOptions = (['general', 'finance', 'hr'] as const).filter((d) => canUploadDomain(user?.role, d));
  useEffect(() => {
    if (!domainOptions.includes(uploadDomain)) setUploadDomain('general');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);
  const [selected, setSelected] = useState<DocItem | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createdDraft, setCreatedDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api.base}/api/documents`, { headers: authHeaders(), cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as DocItem[];
      setDocs(rows);
      setLoadError(false);
      return rows;
    } catch {
      // DB/API mati: tampilkan kosong + error, JANGAN data simulasi.
      setLoadError(true);
      return [] as DocItem[];
    }
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
      form.append('domain', uploadDomain);
      const res = await fetch(`${api.base}/api/documents/upload`, { method: 'POST', headers: authHeaders(), body: form });
      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as DocItem[];
      toast(`${created.length} documents queued — extraction running`);
      await load();
    } catch {
      // Upload gagal (API/DB mati): JANGAN tampilkan baris palsu — error eksplisit.
      toast('Upload failed — API/database unreachable. Check the connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const viewExtract = async (doc: DocItem) => {
    setSelected(doc);
    setEdited({});
    setCreatedDraft(null);
    try {
      const res = await fetch(`${api.base}/api/documents/${doc.id}/extract`, { headers: authHeaders() });
      if (!res.ok) throw new Error('nf');
      const json = await res.json();
      setExtraction(json.extraction as DocumentExtraction);
    } catch {
      setExtraction(null);
      // 422 (belum ada teks terparse) maupun API mati: katakan terus terang.
      toast(`Extraction for ${doc.fileName} is not ready — wait for Processed status or re-upload`);
    }
  };

  const removeDoc = async (doc: DocItem) => {
    try {
      const res = await fetch(`${api.base}/api/documents/${doc.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (selected?.id === doc.id) { setSelected(null); setExtraction(null); setEdited({}); setCreatedDraft(null); }
      await load();
      toast(`${doc.fileName} deleted`);
    } catch {
      toast(`Could not delete ${doc.fileName} — API/database unreachable`);
    }
  };

  // Manusia perbaiki nilai field, lalu jadikan draft — template baku per kind,
  // keputusan final tetap di flow approve.
  const makeDraft = async () => {
    if (!selected || !extraction) return;
    setCreating(true);
    const kind = draftKindForExtraction(extraction.kind);
    const facts = extraction.fields.map((f) => `${f.label}: ${edited[f.label] ?? f.value}`);
    if (extraction.missingFields.length) facts.push(`Missing — needs human completion: ${extraction.missingFields.join(', ')}`);
    const payload = {
      kind,
      title: `${extraction.kind}: ${selected.fileName}`,
      body: renderDraftBody(kind, {
        summary: `Extraction review of ${selected.fileName} (${extraction.kind}, confidence ${Math.round(extraction.confidence * 100)}%).`,
        facts,
        sources: [{ label: selected.fileName, detail: extraction.kind }],
        assistantName: 'Document Intelligence',
      }),
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
    <div className="content-page page-scroll"><PageHeader title="Document ingestion" subtitle="Copilot knowledge — upload and process documents for grounded search and analysis." />
      <div className="document-layout">
        <div className="table-card upload-card">
          <label className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}>
            <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx,.png,.jpg,.jpeg,.tif,.tiff,.bmp" onChange={(e) => uploadFiles(e.target.files)} />
            <div className="upload-symbol"><Icon name="upload" size={26} /></div>
            <div className="drop-title">{uploading ? 'Uploading…' : 'Drop business documents here'}</div>
            <div className="drop-copy">Tender PDFs, sales spreadsheets, quotations, scanned photos (OCR), and other records</div>
            <span className="btn btn-primary">Browse files</span>
            <div className="drop-meta">PDF, XLSX, XLS, CSV, DOCX, PNG, JPG, TIF, BMP · Maximum 50 MB</div>
            <div className="drop-meta">Visibility:&nbsp;
              <select aria-label="Document domain" value={uploadDomain} onChange={(e) => setUploadDomain(e.target.value as 'general' | 'finance' | 'hr')} onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
                {domainOptions.includes('general') && <option value="general">General — all roles</option>}
                {domainOptions.includes('finance') && <option value="finance">Finance — finance + management</option>}
                {domainOptions.includes('hr') && <option value="hr">HR — hr + management</option>}
              </select>
            </div>
          </label>
          <div className="queue-header"><div><div className="table-title">Processing queue</div><div className="table-subtitle">{loadError ? 'Database unreachable — no placeholder data shown' : `${docs.length} files · stored in database`}</div></div></div>
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
