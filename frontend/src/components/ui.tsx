import { AlertCircle, Building2, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Supplier } from '../types';

export function Badge({ tone = 'muted', children, dot = false }: {
  tone?: 'green' | 'amber' | 'red' | 'muted' | 'violet' | 'blue'; children: ReactNode; dot?: boolean;
}) {
  return <span className={'badge badge-' + tone}>{dot && <span className="status-dot" />}{children}</span>;
}

export function SupplierBadge({ supplier }: { supplier: Supplier }) {
  return <Badge tone={supplier === 'Supplier A' ? 'blue' : 'violet'} dot>{supplier}</Badge>;
}

export function Notice({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'red' | 'green' }) {
  return <div className={'notice notice-' + tone} role={tone === 'red' ? 'alert' : 'status'}><AlertCircle size={18} /> <div>{children}</div></div>;
}

export function PartialNotice({ suppliers }: { suppliers: Supplier[] }) {
  return suppliers.length > 0 && <Notice><strong>Partial results.</strong> {suppliers.join(' and ')} {suppliers.length === 1 ? 'is' : 'are'} unavailable. Showing offers from the responding supplier.</Notice>;
}

export function PanelState({ title, description, action, loading = false }: {
  title: string; description?: string; action?: ReactNode; loading?: boolean;
}) {
  const Icon = loading ? LoaderCircle : Building2;
  return <div className="panel-state" role={loading ? 'status' : undefined}>
    <span className="state-icon"><Icon size={22} className={loading ? 'spinning' : undefined} /></span>
    <strong>{title}</strong>{description && <p>{description}</p>}{action}
  </div>;
}

export function Stat({ label, value, detail, icon: Icon, tone = 'green' }: {
  label: string; value: ReactNode; detail: string; icon: LucideIcon; tone?: 'green' | 'blue' | 'violet' | 'amber';
}) {
  return <article className="stat">
    <div className="stat-top"><span>{label}</span><span className={'stat-icon icon-' + tone}><Icon size={17} /></span></div>
    <strong>{value}</strong><p>{detail}</p>
  </article>;
}

export function PageIntro({ title, description }: { title: string; description: string }) {
  return <div className="page-intro"><h1>{title}</h1><p>{description}</p></div>;
}
