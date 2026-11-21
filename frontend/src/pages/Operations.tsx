import { Activity, CheckCircle2, Database, ExternalLink, GitBranch, Globe2, Layers3, Radio, Server, XCircle } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage, temporalUrl } from '../api';
import { Badge, Notice, PageIntro, PanelState } from '../components/ui';
import { cityName } from '../data';
import { serviceNames, type Health, type Service } from '../types';

export type HealthQuery = UseQueryResult<Health, Error>;

const serviceInfo = {
  api: { name: 'Backend API', detail: 'Express routing and validation', icon: Server },
  redis: { name: 'Redis', detail: 'Offer cache and price range queries', icon: Database },
  temporal: { name: 'Temporal namespace', detail: 'Workflow service connectivity', icon: GitBranch },
  supplierA: { name: 'Supplier A', detail: 'Hotel inventory feed', icon: Layers3 },
  supplierB: { name: 'Supplier B', detail: 'Hotel inventory feed', icon: Globe2 },
};

export function connectionState(query: HealthQuery) {
  if (query.isError) return { text: 'Backend unavailable', short: 'Offline', tone: 'red' } as const;
  if (!query.data) return { text: 'Checking connection', short: 'Checking', tone: 'muted' } as const;
  if (query.data.status === 'healthy') return { text: 'Backend connected', short: 'Connected', tone: 'green' } as const;
  return query.data.status === 'degraded' ? { text: 'Backend degraded', short: 'Degraded', tone: 'amber' } as const
    : { text: 'Services unavailable', short: 'Unavailable', tone: 'red' } as const;
}

function ServiceRow({ service, query }: { service: Service; query: HealthQuery }) {
  const { icon: Icon, name, detail } = serviceInfo[service];
  const status = query.data?.services[service];
  return <div className="service-row">
    <span className="section-icon"><Icon size={20} /></span>
    <div className="service-text"><strong>{name}</strong><p>{detail}</p></div>
    {status === 'healthy' ? <Badge tone="green"><CheckCircle2 size={13} />Healthy</Badge>
      : status === 'unhealthy' ? <Badge tone="red"><XCircle size={13} />Unhealthy</Badge>
      : <Badge>Unknown</Badge>}
  </div>;
}

export function HealthPage({ query }: { query: HealthQuery }) {
  const state = connectionState(query);
  return <>
    <PageIntro title="System health" description="Check the API, cache, workflow service, and supplier feeds." />
    <section className="card health-summary">
      <span className="section-icon"><Activity size={22} /></span>
      <div><h2>{state.text}</h2><p>{query.dataUpdatedAt ? 'Last checked ' + new Date(query.dataUpdatedAt).toLocaleTimeString() : 'Waiting for service status'} · Checks every 30 seconds</p></div>
      <button className="button secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><Radio size={16} />{query.isFetching ? 'Checking…' : 'Check health'}</button>
    </section>
    {query.isError && <Notice tone="red">{errorMessage(query.error)} {query.data && 'Service badges show the last available response.'}</Notice>}
    {!query.isError && query.data?.status === 'degraded' && <Notice>One or more suppliers are unavailable. Offer searches can still return partial results.</Notice>}
    {!query.isError && query.data?.status === 'unhealthy' && <Notice tone="red">Redis or Temporal is unavailable. Some offer operations may fail.</Notice>}
    <section className="card services">
      <div className="section-heading"><span className="section-icon"><Server size={18} /></span><div><h2>Service checks</h2><p>Latest status from the backend health endpoint</p></div></div>
      {query.isPending ? <PanelState title="Checking services…" loading /> : serviceNames.map((service) => <ServiceRow key={service} service={service} query={query} />)}
    </section>
  </>;
}

export function Workflows({ city, health }: { city: string; health: HealthQuery }) {
  const status = health.isError ? undefined : health.data?.services.temporal;
  return <>
    <PageIntro title="Workflow monitor" description="Inspect hotel aggregation runs in Temporal." />
    <section className="card workflow-card">
      <span className="section-icon"><GitBranch size={24} /></span>
      <div><h2>Temporal workflow history</h2><p>Use your Temporal console to inspect run status, timing, results, and activity history.</p>
        {temporalUrl && <a className="button primary" href={temporalUrl} target="_blank" rel="noreferrer">Open Temporal UI <ExternalLink size={16} /></a>}</div>
      <Badge tone={status === 'healthy' ? 'green' : status === 'unhealthy' ? 'red' : 'muted'} dot>{status === 'healthy' ? 'Namespace healthy' : status === 'unhealthy' ? 'Namespace unhealthy' : 'Namespace status unknown'}</Badge>
    </section>
    <section className="card workflow-info"><h2>Find the current city’s runs</h2>
      <dl><div><dt>City</dt><dd>{cityName(city) || '—'}</dd></div><div><dt>Workflow type</dt><dd><code>hotelAggregationWorkflow</code></dd></div>
      <div><dt>Workflow ID to search</dt><dd><code>{city ? 'hotel-aggregation:' + city : '—'}</code></dd></div></dl>
      <p>Look for both supplier activities, offer deduplication, and the Redis snapshot write in the event history.</p>
    </section>
  </>;
}
