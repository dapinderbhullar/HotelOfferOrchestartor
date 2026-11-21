import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BarChart3, GitBranch, LayoutDashboard, Menu, RefreshCw, Search as SearchIcon, X } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { errorMessage, refreshOffers, searchParams } from './api';
import { Badge, Notice, PanelState } from './components/ui';
import { cityName, validateSearch } from './data';
import { Hotels } from './pages/Hotels';
import { connectionState, HealthPage, Workflows } from './pages/Operations';
import { healthQuery, offerKey, offersQuery } from './queries';
import type { Search } from './types';

const Analytics = lazy(() => import('./pages/Analytics').then(({ Analytics }) => ({ default: Analytics })));

const navigation = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/hotels', label: 'Hotel Search', icon: SearchIcon },
  { path: '/analytics', label: 'Price Analytics', icon: BarChart3 },
  { path: '/workflows', label: 'Workflow Monitor', icon: GitBranch },
  { path: '/health', label: 'System Health', icon: Activity },
];

export function App() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigationElement = useRef<HTMLElement>(null);
  const [lastRefresh, setLastRefresh] = useState<Record<string, number>>({});
  const search: Search = {
    city: (params.get('city') ?? 'delhi').trim().toLowerCase(),
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
  };
  const queryString = location.search;
  const active = navigation.find(({ path }) => path === location.pathname) ?? navigation[0];
  const invalid = validateSearch(search);
  const onOffersPage = ['/', '/hotels', '/analytics'].includes(location.pathname);
  const health = useQuery(healthQuery);
  const offers = useQuery(offersQuery(search, !invalid && onOffersPage));
  const connection = connectionState(health);
  useEffect(() => {
    if (!open) return;
    navigationElement.current?.querySelector('a')?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  const refresh = useMutation({
    mutationFn: refreshOffers,
    onSuccess: async (result, city) => {
      const completeKey = offerKey({ city, minPrice: '', maxPrice: '' });
      // Stop older reads from overwriting the newly returned snapshot.
      await client.cancelQueries({ queryKey: ['offers', city] });
      client.setQueryData(completeKey, result);
      setLastRefresh((previous) => ({ ...previous, [city]: Date.now() }));
      void client.invalidateQueries({
        queryKey: ['offers', city],
        predicate: ({ queryKey }) => Boolean(queryKey[2] || queryKey[3]),
      });
      void client.invalidateQueries({ queryKey: ['health'] });
    },
  });

  function onSearch(next: Search) {
    if (!refresh.isPending) refresh.reset();
    const nextParams = searchParams(next);
    if (offerKey(next).every((value, index) => value === offerKey(search)[index])) {
      void offers.refetch();
    } else {
      setParams(nextParams);
    }
  }

  function closeNavigation() {
    if (!open) return;
    setOpen(false);
    menuButton.current?.focus();
  }

  const hotelProps = { search, invalid, query: offers, onSearch, queryString };
  return <div className="shell">
    <a className="skip-link" href="#content">Skip to content</a>
    <aside className={'sidebar' + (open ? ' sidebar-open' : '')} aria-label="Dashboard sidebar">
      <div className="brand">
        <img src="/icon.svg" alt="" width={40} height={40} />
        <div><strong>Hotel Offer</strong><span>Orchestrator</span></div>
        <button className="icon-button mobile-close" aria-label="Close navigation" onClick={closeNavigation}><X size={21} /></button>
      </div>
      <nav ref={navigationElement} id="navigation" aria-label="Main navigation">
        {navigation.map(({ path, label, icon: Icon }) => <NavLink key={path} end={path === '/'} to={path + queryString} onClick={closeNavigation}>
          <Icon size={19} strokeWidth={1.8} /> {label}
        </NavLink>)}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-footer-icon"><Activity size={17} /></span>
        <div><strong>Local workspace</strong><span>Hotel aggregation</span></div>
      </div>
    </aside>
    {open && <button className="mobile-overlay" tabIndex={-1} aria-label="Close navigation overlay" onClick={closeNavigation} />}
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-title">
          <button ref={menuButton} className="icon-button mobile-menu" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open} aria-controls="navigation" onClick={() => setOpen(!open)}><Menu size={23} /></button>
          <span>{active.label}</span>
        </div>
        <div className="topbar-actions">
          <div className="connection"><Badge tone={connection.tone} dot><span className="connection-full">{connection.text}</span><span className="connection-short" aria-hidden="true">{connection.short}</span></Badge></div>
          <button className="button primary refresh-button" title={search.city ? 'Refresh ' + cityName(search.city) + ' offers' : 'Enter a city first'} disabled={refresh.isPending || !search.city} onClick={() => refresh.mutate(search.city)}>
            <RefreshCw size={16} className={refresh.isPending ? 'spinning' : undefined} />
            <span>{refresh.isPending ? 'Refreshing…' : 'Refresh Offers'}</span>
          </button>
        </div>
      </header>
      <main id="content" className="main-content">
        {refresh.isSuccess && refresh.variables === search.city && <Notice tone={refresh.data.failedSuppliers.length ? 'amber' : 'green'}>
          {cityName(search.city)} offers refreshed. {refresh.data.offers.length} returned{refresh.data.failedSuppliers.length ? ' · ' + refresh.data.failedSuppliers.join(' and ') + ' unavailable.' : '.'}
          <button className="text-button" onClick={() => refresh.reset()}>Dismiss</button>
        </Notice>}
        {refresh.isError && refresh.variables === search.city && <Notice tone="red"><strong>Refresh failed.</strong> {errorMessage(refresh.error)}<button className="text-button" onClick={() => refresh.reset()}>Dismiss</button></Notice>}
        <Routes>
          <Route path="/" element={<Hotels {...hotelProps} overview />} />
          <Route path="/hotels" element={<Hotels {...hotelProps} />} />
          <Route path="/analytics" element={<Suspense fallback={<div className="card"><PanelState title="Loading analytics…" loading /></div>}><Analytics {...hotelProps} /></Suspense>} />
          <Route path="/workflows" element={<Workflows city={search.city} health={health} />} />
          <Route path="/health" element={<HealthPage query={health} />} />
          <Route path="*" element={<Navigate replace to={'/' + queryString} />} />
        </Routes>
        <footer className="workspace-footer">
          <span>Hotel Offer Orchestrator</span>
          {lastRefresh[search.city] && <span>Last successful refresh for {cityName(search.city)} · {new Date(lastRefresh[search.city]).toLocaleTimeString()}</span>}
        </footer>
      </main>
    </div>
  </div>;
}
