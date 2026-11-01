'use client';
import { Shell } from '@/components/layout/Shell';
import { Button, Icon, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/lib/store';

const cards: [string, string, string, string, string][] = [
  ['Tender Opportunity Review', 'Review and prioritize active government tenders.', '12 records', '4 conversations', 'amber'],
  ['Distributor Performance', 'Analyze sales by region, product, and quarter.', '8 reports', '3 conversations', 'blue'],
  ['Product Portfolio Intelligence', 'Explore catalogue, pricing, and sales trends.', '64 products', '6 insights', 'green'],
  ['Government Tender Response', 'Organize requirements, compliance, and tasks.', '9 tasks', '5 documents', 'purple'],
];

export default function SpacesPage() {
  const { toast } = useToast();
  return <Shell title="Spaces">
    <div className="content-page page-scroll"><PageHeader title="Spaces" subtitle="Persistent workspaces organized around your business goals." action={<Button icon="plus" variant="primary" onClick={() => toast('New Space created')}>Create Space</Button>} />
      <div className="space-grid">{cards.map(([name, desc, stat, meta, tone]) =>
        <button className="space-card" key={name} onClick={() => toast(`${name} workspace opened`)}>
          <div className={`space-art ${tone}`}><Icon name={name.includes('Tender') ? 'file' : name.includes('Distributor') ? 'chart' : name.includes('Product') ? 'grid' : 'check'} size={24} /></div>
          <div className="space-body"><div className="space-title">{name}</div><div className="space-desc">{desc}</div><div className="space-stats"><span>{stat}</span><span>{meta}</span></div>
          <div className="space-footer"><div className="avatar-stack"><span>IN</span><span>SM</span><span>+2</span></div><Icon name="arrow" /></div></div>
        </button>)}
      </div>
    </div>
  </Shell>;
}
