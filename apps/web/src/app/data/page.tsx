'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Status } from '@/components/ui/primitives';
import { api, getStoredKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import { sqlTablesFor, type Tender } from '@street-smart/shared';

interface SqlResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  via: string;
  tables: string[];
}

export default function DataPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Browser tender hanya untuk sales/operations/management; finance/HR
  // memakai Text-to-SQL di atas (tabel role-nya, enforcement di server).
  const canBrowseTenders = !user || user.role === 'sales' || user.role === 'operations' || user.role === 'management';
  const roleTables = sqlTablesFor(user?.role);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Tender[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Tender | null>(null);
  const [question, setQuestion] = useState('');
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fName, setFName] = useState('');
  const [fAgency, setFAgency] = useState('');
  const [fCountry, setFCountry] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fClose, setFClose] = useState('');
  const [fValue, setFValue] = useState('');

  const addTender = async () => {
    if (!fName.trim() || !fAgency.trim() || !fCountry.trim() || !fProduct.trim() || !fClose.trim() || !fValue.trim()) {
      toast('Fill all tender fields first');
      return;
    }
    setAdding(true);
    try {
      const key = getStoredKey();
      const res = await fetch(`${api.base}/api/tenders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
        body: JSON.stringify({ name: fName.trim(), agency: fAgency.trim(), country: fCountry.trim(), product: fProduct.trim(), closeLabel: fClose.trim(), value: fValue.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null) as { error?: string } | null)?.error ?? 'save failed');
      setFName('');
      setFAgency('');
      setFCountry('');
      setFProduct('');
      setFClose('');
      setFValue('');
      setShowAdd(false);
      await load();
      toast('Tender saved to the pipeline');
    } catch {
      toast('Save failed — check the API connection');
    } finally {
      setAdding(false);
    }
  };

  const load = useCallback(async () => {
    // Tanpa fallback diam-diam: gagal = daftar kosong + penanda error.
    const live = await api.get<Tender[] | null>('/api/tenders', null);
    if (live) {
      setRows(live);
      setLoadError(false);
    } else {
      setRows([]);
      setLoadError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const askSql = async () => {
    if (!question.trim() || querying) return;
    setQuerying(true);
    try {
      const key = getStoredKey();
      const res = await fetch(`${api.base}/api/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (!res.ok) {
        const tables = Array.isArray(json.tables) && json.tables.length ? ` · your tables: ${json.tables.join(', ')}` : '';
        toast(`${json.error ?? 'Query failed'}${tables}`);
        setResult(null);
      } else {
        setResult(json as SqlResult);
      }
    } catch {
      toast('API unreachable — Text-to-SQL needs the API running');
      setResult(null);
    } finally {
      setQuerying(false);
    }
  };

  const filtered = rows.filter((t) => `${t.name} ${t.agency} ${t.country}`.toLowerCase().includes(search.toLowerCase()));
  return <Shell title="Database explorer">
    <div className="data-page"><PageHeader title="Database explorer" subtitle={`Browse indexed operational records and source datasets · ${loadError ? 'Database unreachable — no placeholder data shown' : 'Live database'}.`} action={canBrowseTenders ? <Button icon="download" onClick={() => toast('Tender dataset exported')}>Export</Button> : undefined} />
      <div className="dataset" style={{ marginBottom: 12 }}>
        <div className="dataset-header"><div><div className="table-title">Ask your data</div><div className="table-subtitle">Read-only Text-to-SQL over tables your role may access (allowlisted columns, max 50 rows).</div></div><Status tone="blue">Text-to-SQL</Status></div>
        <div className="data-toolbar"><div className="search-field"><Icon name="search" /><Input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') askSql(); }} placeholder='e.g. how many overdue invoices? · how many tenders?' /></div><Button icon="spark" variant="primary" onClick={askSql}>{querying ? 'Running…' : 'Run query'}</Button></div>
        {result && <div className="table-scroll"><div className="table-subtitle" style={{ padding: '8px 0' }}>{result.sql} · {result.rowCount} rows · {result.via}</div>
          <table><thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{result.rows.map((r, i) => <tr key={i}>{result.columns.map((c) => <td key={c}>{String(r[c] ?? '—')}</td>)}</tr>)}</tbody></table></div>}
      </div>
      {!canBrowseTenders ? <div className="dataset"><div className="table-title">Your tables</div>
        <div className="table-subtitle">Signed in as {user?.name} ({user?.role}). Tender browsing is limited to sales, operations and management — use Text-to-SQL above over your tables: {roleTables.length ? roleTables.join(', ') : '—'}.</div></div> : <div className="database-workspace">
        <aside className="catalog"><div className="catalog-title">Data catalog</div><Input placeholder="Search datasets" />
          <div className="tree">
            <div className="tree-group active"><div><Icon name="database" />Tenders 2026</div><span>1,248</span></div>
            {['Active tenders', 'Submitted tenders', 'Won tenders', 'Lost tenders'].map((item) => <button key={item} onClick={() => toast(`${item} dataset selected`)}>{item}<span>120</span></button>)}
            <div className="tree-group"><div><Icon name="chart" />Distributor sales</div><span>8,420</span></div>
            <div className="tree-group"><div><Icon name="grid" />Product catalogue</div><span>64</span></div>
            <div className="tree-group"><div><Icon name="file" />Past quotations</div><span>2,748</span></div>
          </div>
        </aside>
        <div className="dataset">
          <div className="dataset-header"><div><div className="table-title">Tenders 2026</div><div className="table-subtitle">Government infrastructure opportunities · Updated 10 minutes ago</div></div><div className="toolbar-actions"><Status tone="green">Connected</Status><Button icon="plus" variant="secondary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Close' : 'Add tender'}</Button></div></div>
          {showAdd && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Tender name *" />
            <Input value={fAgency} onChange={(e) => setFAgency(e.target.value)} placeholder="Agency *" />
            <Input value={fCountry} onChange={(e) => setFCountry(e.target.value)} placeholder="Country *" />
            <Input value={fProduct} onChange={(e) => setFProduct(e.target.value)} placeholder="Product *" />
            <Input value={fClose} onChange={(e) => setFClose(e.target.value)} placeholder="Closes — e.g. 24 Nov 2026 *" />
            <Input value={fValue} onChange={(e) => setFValue(e.target.value)} placeholder="Value — e.g. NZD 1,250,000 *" />
            <div className="action-row" style={{ gridColumn: '1 / -1' }}><Button variant="primary" onClick={addTender} disabled={adding}>{adding ? 'Saving…' : 'Save tender'}</Button></div>
          </div>}
          <div className="data-toolbar"><div className="search-field"><Icon name="search" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records..." /></div><Button icon="filter" onClick={() => toast('Filters opened')}>Filters</Button><Button icon="refresh" variant="icon" title="Refresh" onClick={() => { load(); toast('Records refreshed'); }} /></div>
          <div className="table-scroll"><table><thead><tr>{['Tender ID', 'Tender name', 'Agency', 'Country', 'Closing date', 'Estimated value', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map((t) => <tr key={t.id} onClick={() => setSelected(t)}><td className="id-cell">{t.id}</td><td>{t.name}</td><td>{t.agency}</td><td>{t.country}</td><td>{t.date}</td><td>{t.value}</td><td><Status tone={t.status === 'Won' ? 'green' : t.status === 'Pending' ? 'amber' : 'blue'}>{t.status}</Status></td></tr>)}</tbody></table></div>
          {selected && <div className="record-preview"><div className="table-title">{selected.name}</div><div className="table-subtitle">{selected.id} · {selected.agency}</div><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>}
        </div>
      </div>}
    </div>
  </Shell>;
}
