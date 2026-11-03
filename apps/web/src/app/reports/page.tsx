'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader } from '@/components/ui/primitives';
import { api, getStoredKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';
import { formatMoney, parseCloseLabel, type Tender } from '@street-smart/shared';

interface DistributorRow {
  distributor: string;
  country: string;
  product: string;
  sku: string;
  quarter: string;
  units: number;
  amountCents: number;
  currency: string;
}

export default function ReportsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Tender reports hanya untuk sales + operations + management.
  const [rows, setRows] = useState<Tender[] | null>(null);
  const [tab, setTab] = useState<'tenders' | 'distributor'>('tenders');
  const [sales, setSales] = useState<DistributorRow[] | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);

  const load = useCallback(async () => {
    setRows(await api.get<Tender[] | null>('/api/tenders', null));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Distributor sales via Text-to-SQL eksplisit (server validasi allowlist per-role).
  const loadSales = useCallback(async (force = false) => {
    if ((sales || salesLoading) && !force) return;
    setSalesLoading(true);
    try {
      const key = getStoredKey();
      const res = await fetch(`${api.base}/api/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
        body: JSON.stringify({ sql: 'SELECT distributor, country, product, sku, quarter, units, amountCents, currency FROM "DistributorSale" ORDER BY quarter, country LIMIT 50' }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? 'Distributor data unavailable');
        setSales([]);
      } else {
        setSales((json.rows ?? []) as DistributorRow[]);
      }
    } catch {
      toast('API unreachable — distributor data needs the API running');
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, [sales, salesLoading, toast]);

  if (user && user.role !== 'sales' && user.role !== 'operations' && user.role !== 'management') {
    return <Shell title="Tender reports"><div className="content-page page-scroll">
      <PageHeader title="Tender reports" subtitle="AI-generated analytics grounded in your tender pipeline." />
      <div className="dataset"><div className="table-title">Not available for your role</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). Tender analytics is visible to sales, operations and management.</div></div>
    </div></Shell>;
  }

  if (rows === null) {
    return <Shell title="Tender reports"><div className="content-page page-scroll">
      <PageHeader title="Tender reports" subtitle="AI-generated analytics grounded in your tender pipeline." />
      <div className="dataset"><div className="table-title">Database unreachable</div>
        <div className="table-subtitle">No placeholder figures shown. Check the API connection, then reload.</div>
        <div className="action-row"><Button variant="primary" onClick={() => { load(); toast('Retrying…'); }}>Retry</Button></div></div>
    </div></Shell>;
  }

  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const withDates = rows.map((t) => ({ t, closes: parseCloseLabel(t.date) }));
  const closingSoon = withDates.filter((r) => r.closes && r.closes >= now && r.closes <= in30d);
  const active = rows.filter((t) => t.status === 'Identified' || t.status === 'Pending' || t.status === 'Submitted');
  const won = rows.filter((t) => t.status === 'Won');
  const byCountry = new Map<string, number>();
  for (const t of rows) byCountry.set(t.country, (byCountry.get(t.country) ?? 0) + 1);
  const byStatus = new Map<string, number>();
  for (const t of rows) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
  const maxCountry = Math.max(1, ...byCountry.values());
  const kpis: [string, string, string][] = [
    [String(rows.length), 'Total tenders', `${active.length} active`],
    [String(won.length), 'Won', rows.length ? `${Math.round((won.length / rows.length) * 100)}% win rate` : 'no tenders yet'],
    [String(closingSoon.length), 'Closing within 30 days', closingSoon.length ? 'needs attention' : 'nothing imminent'],
  ];

  const importCsv = async (file: File) => {
    const text = await file.text();
    setSalesLoading(true);
    try {
      const key = getStoredKey();
      const res = await fetch(`${api.base}/api/distributor/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
        body: JSON.stringify({ csv: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? 'Import failed');
      } else {
        toast(`Imported ${json.created} rows${json.skipped ? `, ${json.skipped} already existed` : ''}${json.totalErrors ? `, ${json.totalErrors} bad rows` : ''}`);
        setSales(null);
        await loadSales(true);
      }
    } catch {
      toast('API unreachable — import needs the API running');
    } finally {
      setSalesLoading(false);
    }
  };

  const nzUnits = (sales ?? []).filter((r) => /zealand/i.test(r.country)).reduce((a, r) => a + r.units, 0);
  const auUnits = (sales ?? []).filter((r) => /australia/i.test(r.country)).reduce((a, r) => a + r.units, 0);
  const totalUnits = (sales ?? []).reduce((a, r) => a + r.units, 0);
  const byProduct = new Map<string, number>();
  for (const r of sales ?? []) byProduct.set(r.product, (byProduct.get(r.product) ?? 0) + r.units);
  const topProduct = [...byProduct.entries()].sort((a, b) => b[1] - a[1])[0];

  return <Shell title="Tender reports">
    <div className="content-page page-scroll"><PageHeader title="Tender reports" subtitle="Copilot analytics computed live from your pipeline and distributor sales." action={<><Button icon="download" onClick={() => toast('Report exported as PDF')}>Export</Button></>} />
      <div className="action-row" role="group" aria-label="Report section" style={{ marginBottom: 14 }}>
        <div className="segmented">
          <button className={tab === 'tenders' ? 'on' : ''} onClick={() => setTab('tenders')}>Tenders</button>
          <button className={tab === 'distributor' ? 'on' : ''} onClick={() => { setTab('distributor'); loadSales(); }}>Distributor sales</button>
        </div>
      </div>
      {tab === 'tenders' ? <>
      <div className="report-kpis">{kpis.map(([value, label, change]) => <div className="report-kpi" key={label}><div className="kpi-label">{label}</div><div className="report-value">{value}</div><div className="positive">{change}</div></div>)}</div>
      <div className="report-grid">
        <div className="table-card country-card"><div className="table-title">Pipeline by country</div><div className="table-subtitle">Share of tracked tenders (count)</div>
          {[...byCountry.entries()].length === 0 && <div className="table-subtitle">No tenders yet.</div>}
          {[...byCountry.entries()].map(([name, n]) => <div className="country-row" key={name}><div><span>{name}</span><strong>{n} · {Math.round((n / Math.max(rows.length, 1)) * 100)}%</strong></div><div className="country-track"><i style={{ width: `${Math.round((n / maxCountry) * 100)}%` }} /></div></div>)}
        </div>
        <div className="table-card country-card"><div className="table-title">Pipeline by status</div><div className="table-subtitle">Where every tender stands</div>
          {[...byStatus.entries()].length === 0 && <div className="table-subtitle">No tenders yet.</div>}
          {[...byStatus.entries()].map(([name, n]) => <div className="country-row" key={name}><div><span>{name}</span><strong>{n}</strong></div><div className="country-track"><i style={{ width: `${Math.round((n / Math.max(rows.length, 1)) * 100)}%` }} /></div></div>)}
        </div>
      </div>
      </> : <>
      <div className="report-kpis">
        <div className="report-kpi"><div className="kpi-label">Total units</div><div className="report-value">{sales === null || salesLoading ? '…' : totalUnits.toLocaleString()}</div><div className="positive">across {(sales ?? []).length} rows</div></div>
        <div className="report-kpi"><div className="kpi-label">New Zealand</div><div className="report-value">{sales === null || salesLoading ? '…' : nzUnits.toLocaleString()}</div><div className="positive">units</div></div>
        <div className="report-kpi"><div className="kpi-label">Australia</div><div className="report-value">{sales === null || salesLoading ? '…' : auUnits.toLocaleString()}</div><div className="positive">units</div></div>
      </div>
      <div className="table-card"><div className="section-heading"><div><div className="table-title">Distributor sales</div><div className="table-subtitle">{topProduct ? `Top product: ${topProduct[0]} (${topProduct[1].toLocaleString()} units)` : 'Live distributor rows'} · amounts in original currency</div></div><div className="toolbar-actions"><label className="btn btn-secondary" style={{ cursor: 'pointer' }}>Import CSV<input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} /></label></div></div>
        {salesLoading && <div className="table-subtitle">Loading distributor rows…</div>}
        {sales !== null && !salesLoading && sales.length === 0 && <div className="table-subtitle">No distributor rows yet.</div>}
        {sales !== null && sales.length > 0 && <div className="table-scroll"><table><thead><tr>{['Distributor', 'Country', 'Product', 'SKU', 'Quarter', 'Units', 'Amount'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{sales.map((r) => <tr key={`${r.distributor}-${r.sku}-${r.quarter}`}><td>{r.distributor}</td><td>{r.country}</td><td>{r.product}</td><td className="id-cell">{r.sku}</td><td>{r.quarter}</td><td>{r.units.toLocaleString()}</td><td>{formatMoney(r.amountCents, r.currency)}</td></tr>)}</tbody></table></div>}
      </div>
      </>}
    </div>
  </Shell>;
}
