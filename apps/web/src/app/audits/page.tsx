'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Button, PageHeader, Status } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store';

interface AuditRow {
  id: string;
  userId: string;
  role: string;
  assistantId: string;
  messagePreview: string;
  via: string;
  createdAt: string;
}

export default function AuditsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    if (user && user.role !== 'management') {
      setDenied(true);
      setRows([]);
      return;
    }
    setDenied(false);
    const data = await api.get<AuditRow[]>('/api/audit?take=100', []);
    // api.get menelan 403 jadi fallback — bedakan via user role (server tetap enforcement).
    if (user && user.role !== 'management') setDenied(true);
    else setRows(data);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (user && user.role !== 'management') {
    return <Shell title="Audit trail"><div className="content-page page-scroll">
      <PageHeader title="Audit trail" subtitle="Who asked what, when (message previews only)." />
      <div className="dataset"><div className="table-title">Management only</div>
        <div className="table-subtitle">Signed in as {user.name} ({user.role}). Switch to a management user via the profile menu to view the audit trail.</div></div>
    </div></Shell>;
  }

  return <Shell title="Audit trail">
    <div className="content-page page-scroll"><PageHeader title="Audit trail" subtitle="Who asked what, when — message previews only, never full content." action={<Button icon="refresh" variant="icon" title="Refresh" onClick={() => { load(); toast('Audit trail refreshed'); }} />} />
      <div className="dataset">
        <div className="data-toolbar"><div className="table-subtitle">{denied ? 'Access denied for your role.' : `${rows.length} entries (latest first)`}</div><Status tone={denied ? 'amber' : 'green'}>{denied ? 'Forbidden' : 'Live'}</Status></div>
        <div className="table-scroll"><table><thead><tr>{['Time', 'User', 'Role', 'Assistant', 'Preview', 'Via'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString()}</td><td className="id-cell">{r.userId}</td><td>{r.role}</td><td>{r.assistantId}</td><td>{r.messagePreview}</td><td><Status tone={r.via === 'http' ? 'green' : 'gray'}>{r.via}</Status></td></tr>)}</tbody></table></div>
      </div>
    </div>
  </Shell>;
}
