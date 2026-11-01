'use client';
import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, Input, PageHeader, Status } from '@/components/ui/primitives';
import { useToast } from '@/lib/store';
import { tenders } from '@street-smart/shared';

export default function DataPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<(typeof tenders)[number] | null>(null);
  const filtered = tenders.filter((t) => `${t.name} ${t.agency} ${t.country}`.toLowerCase().includes(search.toLowerCase()));
  return <Shell title="Database explorer">
    <div className="data-page"><PageHeader title="Database explorer" subtitle="Browse indexed operational records and source datasets." action={<Button icon="download" onClick={() => toast('Tender dataset exported')}>Export</Button>} />
      <div className="database-workspace">
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
          <div className="dataset-header"><div><div className="table-title">Tenders 2026</div><div className="table-subtitle">Government infrastructure opportunities · Updated 10 minutes ago</div></div><Status tone="green">Connected</Status></div>
          <div className="data-toolbar"><div className="search-field"><Icon name="search" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records..." /></div><Button icon="filter" onClick={() => toast('Filters opened')}>Filters</Button><Button icon="refresh" variant="icon" title="Refresh" onClick={() => toast('Records refreshed')} /></div>
          <div className="table-scroll"><table><thead><tr>{['Tender ID', 'Tender name', 'Agency', 'Country', 'Closing date', 'Estimated value', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map((t) => <tr key={t.id} onClick={() => setSelected(t)}><td className="id-cell">{t.id}</td><td>{t.name}</td><td>{t.agency}</td><td>{t.country}</td><td>{t.date}</td><td>{t.value}</td><td><Status tone={t.status === 'Won' ? 'green' : t.status === 'Pending' ? 'amber' : 'blue'}>{t.status}</Status></td></tr>)}</tbody></table></div>
          {selected && <div className="record-preview"><div className="table-title">{selected.name}</div><div className="table-subtitle">{selected.id} · {selected.agency}</div><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>}
        </div>
      </div>
    </div>
  </Shell>;
}
