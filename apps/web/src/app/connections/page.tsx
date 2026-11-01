'use client';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader, Status } from '@/components/ui/primitives';
import { useToast } from '@/lib/store';

export default function ConnectionsPage() {
  const { toast } = useToast();
  return <Shell title="DB connections">
    <div className="content-page page-scroll"><PageHeader title="Database connections" subtitle="Manage the data sources available to Street Smart AI." action={<Button icon="plus" variant="primary" onClick={() => toast('Connection setup opened')}>Add connection</Button>} />
      <div className="connection-grid">{[['Tender Operations DB', 'PostgreSQL', '12,480 records'], ['Distributor Sales Warehouse', 'Microsoft SQL Server', '86,214 records'], ['Product Catalogue', 'MySQL', '64 products']].map(([name, db, records]) =>
        <div className="connection-card" key={name}><div className="connection-top"><div className="connection-icon"><Icon name="database" /></div><Status tone="green">Connected</Status></div>
          <div className="space-title">{name}</div><div className="space-desc">{db} · host••••.internal</div>
          <div className="connection-meta"><span>Last sync<strong>10 minutes ago</strong></span><span>Indexed<strong>{records}</strong></span></div>
          <div className="action-row"><Button icon="pulse" onClick={() => toast(`${name} connection test successful`)}>Test connection</Button><Button icon="more" variant="icon" title="Connection options" /></div>
        </div>)}
      </div>
    </div>
  </Shell>;
}
