import { List, RotateCw, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage } from '../api';
import { cityName } from '../data';
import type { OfferResult, Search } from '../types';
import { OfferTable } from './OfferTable';
import { Badge, Notice, PanelState, PartialNotice } from './ui';

export type OffersQuery = UseQueryResult<OfferResult, Error>;

export function OfferResults({ query, search, invalid, overview, queryString }: {
  query: OffersQuery; search: Search; invalid: string; overview?: boolean; queryString: string;
}) {
  const offers = query.data?.offers;
  const filtered = Boolean(search.minPrice || search.maxPrice);
  return <section className="card results" aria-labelledby="results-heading">
    <div className="results-heading">
      <div className="section-heading"><span className="section-icon"><List size={18} /></span><div>
        <h2 id="results-heading">Hotel offers {offers && <Badge tone="green">{offers.length}</Badge>}</h2>
        <p>{filtered ? 'Price-filtered results' : 'Cheapest offer per hotel'}{search.city && ' · ' + cityName(search.city)}</p>
      </div></div>
      {overview && <Link className="button secondary" to={'/hotels' + queryString}><SlidersHorizontal size={16} /> Price filters</Link>}
    </div>
    {query.data?.failedSuppliers.length ? <div className="results-notice"><PartialNotice suppliers={query.data.failedSuppliers} /></div> : null}
    {query.isError && <div className="results-notice"><Notice tone="red">{errorMessage(query.error)}</Notice></div>}
    {invalid ? <PanelState title="Update your search" description={invalid} />
      : query.isPending ? <PanelState title="Searching hotel offers…" description="Checking current rates for your city." loading />
      : query.isError && !offers ? <PanelState title="Offers unavailable" action={<button className="button secondary" onClick={() => void query.refetch()}><RotateCw size={15} />Retry search</button>} />
      : !offers?.length ? <PanelState title="No hotels found" description={filtered ? 'Try widening or clearing your price range.' : 'Try another supported city, such as Delhi.'} />
      : <OfferTable offers={offers} city={search.city} />}
  </section>;
}
