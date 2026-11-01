'use client';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/lib/store';

const bars = [46, 62, 54, 78, 68, 86, 72, 92];
const values = [420, 580, 490, 760, 640, 920, 710, 1040];
const months = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

export default function ReportsPage() {
  const { toast } = useToast();
  return <Shell title="Tender reports">
    <div className="content-page page-scroll"><PageHeader title="Tender reports" subtitle="AI-generated analytics grounded in your tender pipeline." action={<><Button icon="calendar">Last 12 months</Button><Button icon="download" onClick={() => toast('Report exported as PDF')}>Export</Button></>} />
      <div className="report-kpis">{[['1,248', 'Total tenders', '+8.4% YoY'], ['NZD 8.42M', 'Active pipeline', '+12.1%'], ['34.8%', 'Success rate', '+3.2 pts'], ['42', 'Closing this month', '8 high priority']].map(([value, label, change]) => <div className="report-kpi" key={label}><div className="kpi-label">{label}</div><div className="report-value">{value}</div><div className="positive">{change}</div></div>)}</div>
      <div className="report-grid">
        <div className="table-card chart-card"><div className="section-heading"><div><div className="table-title">Monthly tender performance</div><div className="table-subtitle">Submitted opportunity value, NZD thousands</div></div><Button icon="more" variant="icon" title="Chart options" /></div>
          <div className="bar-chart">{bars.map((h, i) => <div className="bar-column" key={i}><div className="bar-value">{values[i]}</div><div className="bar" style={{ height: `${h}%` }} /><span>{months[i]}</span></div>)}</div></div>
        <div className="table-card country-card"><div className="table-title">Pipeline by country</div><div className="table-subtitle">Share of active opportunity value</div>
          {[['New Zealand', '42%', 42], ['Australia', '27%', 27], ['Asia Pacific', '18%', 18], ['Europe', '13%', 13]].map(([name, value, width]) => <div className="country-row" key={name as string}><div><span>{name}</span><strong>{value}</strong></div><div className="country-track"><i style={{ width: `${width}%` }} /></div></div>)}
        </div>
      </div>
    </div>
  </Shell>;
}
