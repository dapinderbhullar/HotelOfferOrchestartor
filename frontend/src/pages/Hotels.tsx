import { ArrowDownRight, ArrowUpRight, Building2, Layers3, MapPin, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OfferResults, type OffersQuery } from '../components/OfferResults';
import { SearchForm } from '../components/SearchForm';
import { PageIntro, Stat } from '../components/ui';
import { cityName, money, summarize } from '../data';
import type { Search } from '../types';

export interface HotelPageProps {
  search: Search;
  invalid: string;
  query: OffersQuery;
  onSearch: (search: Search) => void;
  queryString: string;
}

export function Hotels({ search, invalid, query, onSearch, queryString, overview = false }: HotelPageProps & { overview?: boolean }) {
  const data = query.data?.offers;
  const stats = summarize(data ?? []);
  const city = cityName(search.city);
  return <>
    {overview ? <>
      <section className="hero">
        <div className="hero-content">
          <div className="hero-location"><MapPin size={14} /> {city || 'Choose a city'}</div>
          <h1>Hotel offers at a glance</h1>
          <p>Compare the best available rates across suppliers.</p>
          <Link className="button hero-button" to={'/hotels' + queryString}><SlidersHorizontal size={16} /> Explore offers</Link>
        </div>
      </section>
      <div className="stat-grid" aria-label="Offer summary">
        <Stat label="Hotels returned" value={data?.length ?? '—'} detail={city ? 'Current results for ' + city : 'Current results'} icon={Building2} />
        <Stat label="Lowest price" value={stats ? money(stats.min) : '—'} detail="Best available offer" icon={ArrowDownRight} tone="blue" />
        <Stat label="Highest price" value={stats ? money(stats.max) : '—'} detail="Top of the returned range" icon={ArrowUpRight} tone="amber" />
        <Stat label="Suppliers represented" value={data ? stats?.suppliers ?? 0 : '—'} detail="Across returned offers" icon={Layers3} tone="violet" />
      </div>
    </> : <PageIntro title="Hotel search" description="Find offers by city and narrow the results by price." />}
    <SearchForm key={queryString} initial={search} advanced={!overview} onSearch={onSearch} pending={!invalid && query.isFetching} />
    <OfferResults key={queryString + '/results'} query={query} search={search} invalid={invalid} overview={overview} queryString={queryString} />
  </>;
}
