'use client';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { useToast } from '@/lib/store';

export default function StatusPage() {
  const { toast } = useToast();
  return <Shell title="System status">
    <div className="content-page page-scroll"><PageHeader title="System status" subtitle="Operational health across your simulated business services." />
      <div className="health-banner"><div className="health-check"><Icon name="check" size={28} /></div><div><div className="health-title">All core services are operational</div><div className="health-copy">Last checked just now · 99.98% uptime over the past 30 days</div></div><Button icon="refresh" onClick={() => toast('System health refreshed')}>Refresh</Button></div>
      <div className="service-list">{[['Database availability', 'Operational', '99.99%', '34 ms'], ['Document processing', 'Operational', '99.97%', '12 queued'], ['AI assistant service', 'Operational', '99.99%', '780 ms'], ['API connectivity', 'Degraded', '98.84%', '2 warnings'], ['Storage utilization', 'Operational', '99.99%', '62% used']].map(([name, state, uptime, detail]) =>
        <div className="service-row" key={name}><div className="service-name"><span className={state === 'Degraded' ? 'indicator warning' : 'indicator'} />{name}</div><Status tone={state === 'Degraded' ? 'amber' : 'green'}>{state}</Status><div className="job-cell"><span>30-day uptime</span>{uptime}</div><div className="job-cell"><span>Current</span>{detail}</div><Button icon="chevron" variant="icon" title="View service details" onClick={() => toast(`${name} details opened`)} /></div>)}
      </div>
    </div>
  </Shell>;
}
