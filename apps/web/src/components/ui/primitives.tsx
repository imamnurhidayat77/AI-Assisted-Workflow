'use client';

import type { FormEvent, ReactNode } from 'react';

// Ikon inline dari Figma Make (dipindah 1:1 agar visual identik)
export type IconName =
  | 'spark' | 'plus' | 'chat' | 'grid' | 'clock' | 'upload' | 'database'
  | 'link' | 'chart' | 'pulse' | 'bell' | 'help' | 'settings' | 'menu'
  | 'search' | 'send' | 'paperclip' | 'mic' | 'chevron' | 'arrow' | 'file'
  | 'check' | 'warning' | 'more' | 'filter' | 'download' | 'refresh'
  | 'close' | 'sun' | 'moon' | 'play' | 'pause' | 'calendar' | 'external' | 'eye';

const paths: Record<IconName, ReactNode> = {
  spark: <><path d="m12 3-1.1 3.2a7 7 0 0 1-4.7 4.7L3 12l3.2 1.1a7 7 0 0 1 4.7 4.7L12 21l1.1-3.2a7 7 0 0 1 4.7-4.7L21 12l-3.2-1.1a7 7 0 0 1-4.7-4.7Z"/><path d="M5 3v4M3 5h4M19 17v4M17 19h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  chat: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  pulse: <path d="M3 12h4l2-7 4 14 2-7h6"/>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-1.2.9-1.2 1.7M12 17h.01"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h-4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  send: <path d="m22 2-7 20-4-9-9-4Z M22 2 11 13"/>,
  paperclip: <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9"/>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  file: <><path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  filter: <path d="M3 5h18l-7 8v5l-4 2v-7Z"/>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 19v2h16v-2"/></>,
  refresh: <><path d="M20 7h-5V2"/><path d="M20 7a9 9 0 1 0 1 7"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>,
  play: <path d="m8 5 11 7-11 7Z"/>,
  pause: <path d="M9 5v14M15 5v14"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5H5V5h5"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Button({ children, icon, variant = 'secondary', onClick, className = '', title, type = 'button', disabled = false }: {
  children?: ReactNode; icon?: IconName; variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger';
  onClick?: () => void; className?: string; title?: string; type?: 'button' | 'submit'; disabled?: boolean;
}) {
  return <button type={type} title={title} onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${className}`}>{icon && <Icon name={icon} />}{children}</button>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ''}`} />;
}

export function Select({ value, onChange, children, className = '' }: {
  value?: string; onChange?: (value: string) => void; children: ReactNode; className?: string;
}) {
  return <select value={value} onChange={(e) => onChange?.(e.target.value)} className={`select ${className}`}>{children}</select>;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`textarea ${props.className || ''}`} />;
}

export function Status({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' | 'gray' }) {
  return <span className={`status status-${tone}`}><span className="status-dot" />{children}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow">Street Smart Copilot</div><div className="page-title">{title}</div><div className="page-subtitle">{subtitle}</div></div>{action}</div>;
}

export function Composer({ value, setValue, onSend, compact = false, mentionOptions, mentionValue, onMention }: {
  value: string; setValue: (v: string) => void; onSend: () => void; compact?: boolean;
  /** @mention ala Joule: opsi assistant (sudah difilter role oleh parent). */
  mentionOptions?: { id: string; name: string; tagline?: string }[];
  mentionValue?: string;
  onMention?: (id: string) => void;
}) {
  const submit = (e: FormEvent) => { e.preventDefault(); onSend(); };
  const canMention = Boolean(mentionOptions?.length && onMention);
  const mentionName = mentionOptions?.find((o) => o.id === mentionValue)?.name;
  const mq = canMention ? (value.match(/@(\w*)$/)?.[1] ?? null) : null;
  const hits = mq === null ? [] : mentionOptions!.filter((o) => o.name.toLowerCase().includes(mq.toLowerCase()) || o.id.includes(mq.toLowerCase()));
  const pick = (id: string) => { setValue(value.replace(/@\w*$/, '')); onMention!(id); };
  return <form className={`composer ${compact ? 'composer-compact' : ''}`} onSubmit={submit}>
    {mq !== null && hits.length > 0 && <div className="mention-pop">
      {hits.map((o) => <button type="button" key={o.id} onClick={() => pick(o.id)}><strong>@{o.name}</strong><small>{o.tagline ?? o.id}</small></button>)}
    </div>}
    <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ask Street Smart anything about your business... (type @ for assistants)"
      rows={compact ? 1 : 2}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const m = value.match(/@(\w*)$/);
          if (m && canMention && hits.length === 1) {
            pick(hits[0].id);
            return;
          }
          onSend();
        }
      }} />
    <div className="composer-toolbar">
      <div className="composer-tools">
        <Button icon="paperclip" variant="icon" title="Attach a document" onClick={() => setValue(`${value}${value ? ' ' : ''}[Document attached]`)} />
        <Button icon="mic" variant="icon" title="Voice input" onClick={() => setValue('Show me the highest priority tender opportunities')} />
        <Select aria-label="Business context"><option>All business data</option><option>Tenders</option><option>Distributor sales</option><option>Product catalogue</option><option>Documents</option></Select>
        {mentionName && mentionValue !== 'auto' && <button type="button" className="mention-chip" title="Mentioned assistant — click to clear" onClick={() => onMention!('auto')}>@{mentionName} ✕</button>}
      </div>
      <Button icon="send" variant="primary" type="submit">Send</Button>
    </div>
  </form>;
}
