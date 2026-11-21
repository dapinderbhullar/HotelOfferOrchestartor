import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronLeft, ChevronRight, Tag, X } from 'lucide-react';
import { cityName, money } from '../data';
import type { Offer } from '../types';
import { Badge, SupplierBadge } from './ui';

const pageSize = 6;
type Sort = { field: 'price' | 'name'; direction: 'asc' | 'desc' };

function SortHeader({ field, sort, onSort, children }: {
  field: Sort['field']; sort: Sort; onSort: (field: Sort['field']) => void; children: string;
}) {
  const Icon = sort.field !== field ? ArrowUpDown : sort.direction === 'asc' ? ArrowDown : ArrowUp;
  return <th scope="col" aria-sort={sort.field !== field ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending'}>
    <button onClick={() => onSort(field)}>{children}<Icon size={13} /></button>
  </th>;
}

function OfferDetails({ offer, city, onClose }: { offer: Offer; city: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="offer-dialog" ref={ref} onClose={onClose} aria-labelledby="details-title">
    <div className="dialog-heading"><span className="section-icon"><Building2 size={19} /></span><button className="icon-button" aria-label="Close offer details" onClick={() => ref.current?.close()}><X size={20} /></button></div>
    <h2 id="details-title">{offer.name}</h2><p>{cityName(city)}</p>
    <dl><div><dt>Price</dt><dd>{money(offer.price)}</dd></div><div><dt>Supplier</dt><dd><SupplierBadge supplier={offer.supplier} /></dd></div><div><dt>Commission</dt><dd>{offer.commissionPct}%</dd></div></dl>
  </dialog>;
}

export function OfferTable({ offers, city }: { offers: Offer[]; city: string }) {
  const [sort, setSort] = useState<Sort>({ field: 'price', direction: 'asc' });
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Offer | null>(null);
  const min = Math.min(...offers.map(({ price }) => price));
  const sorted = [...offers].sort((a, b) => {
    const value = sort.field === 'price' ? a.price - b.price : a.name.localeCompare(b.name);
    return (sort.direction === 'asc' ? value : -value) || a.name.localeCompare(b.name);
  });
  const pageCount = Math.ceil(sorted.length / pageSize);
  const current = Math.min(page, pageCount - 1);
  const first = current * pageSize;
  function toggle(field: Sort['field']) {
    setSort({ field, direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc' });
    setPage(0);
  }
  return <>
    <table className="offer-table" aria-label="Hotel offers">
      <thead><tr><SortHeader field="name" sort={sort} onSort={toggle}>Hotel</SortHeader><SortHeader field="price" sort={sort} onSort={toggle}>Price</SortHeader><th scope="col">Supplier</th><th scope="col">Commission</th><th scope="col">Price status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{sorted.slice(first, first + pageSize).map((offer) => <tr key={offer.name}>
        <td><div className="hotel-cell"><span className="hotel-icon"><Building2 size={17} /></span><div><strong>{offer.name}</strong><span>{cityName(city)}</span></div></div></td>
        <td className="offer-price">{money(offer.price)}</td>
        <td><SupplierBadge supplier={offer.supplier} /></td>
        <td className="commission-cell" aria-label={offer.commissionPct + '% commission'}><span className="mobile-only">Commission </span>{offer.commissionPct}%</td>
        <td className="price-status">{offer.price === min ? <Badge tone="green"><Tag size={12} /> Best price</Badge> : <span className="muted">—</span>}</td>
        <td className="offer-action"><button className="icon-button" aria-label={'View ' + offer.name} onClick={() => setSelection(offer)}><ChevronRight size={17} /></button></td>
      </tr>)}</tbody>
    </table>
    <div className="table-footer">
      <span>Showing {first + 1}–{Math.min(first + pageSize, offers.length)} of {offers.length} offers</span>
      <div className="pagination"><button className="icon-button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={17} /></button><span>{current + 1} / {pageCount}</span><button className="icon-button" aria-label="Next page" disabled={current + 1 === pageCount} onClick={() => setPage(current + 1)}><ChevronRight size={17} /></button></div>
    </div>
    {selection && <OfferDetails offer={selection} city={city} onClose={() => setSelection(null)} />}
  </>;
}
