'use client';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { useToast } from '@/lib/store';
import { alerts } from '@street-smart/shared';

export default function AlertsPage() {
  const { toast } = useToast();
  return <Shell title="Alerts">
    <div className="content-page page-scroll"><PageHeader title="Alerts" subtitle="Review system and business events that need attention." />
      <div className="alert-list">{alerts.map((a) => <div className="alert-card" key={a.title}>
        <div className={`alert-severity ${a.severity.toLowerCase()}`}><Icon name={a.severity === 'Resolved' ? 'check' : 'warning'} /></div>
        <div className="alert-body"><div className="alert-top"><div className="alert-title">{a.title}</div><Status tone={a.severity === 'High' ? 'red' : a.severity === 'Medium' ? 'amber' : 'green'}>{a.severity}</Status></div>
          <div className="alert-desc">{a.desc}</div><div className="alert-meta">{a.module} · {a.time}</div></div>
        {a.severity !== 'Resolved' ? <Button onClick={() => toast(`"${a.title}" marked as resolved`)}>Mark resolved</Button> : <Button variant="ghost" onClick={() => toast('Alert detail opened')}>View detail</Button>}
      </div>)}
      </div>
    </div>
  </Shell>;
}
