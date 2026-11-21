import { useState, type FormEvent } from 'react';
import { MapPin, Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react';
import { currencyCode, validateSearch } from '../data';
import type { Search } from '../types';

export function SearchForm({ initial, advanced = false, onSearch, pending }: {
  initial: Search; advanced?: boolean; onSearch: (search: Search) => void; pending: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  function change(field: keyof Search, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setError('');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = { city: draft.city.trim().toLowerCase(), minPrice: draft.minPrice.trim(), maxPrice: draft.maxPrice.trim() };
    const message = validateSearch(value);
    setError(message);
    if (!message) onSearch(value);
  }
  function clear() {
    const value = { city: draft.city.trim().toLowerCase() || initial.city || 'delhi', minPrice: '', maxPrice: '' };
    setDraft(value);
    setError('');
    onSearch(value);
  }
  return <section className="card search-panel" aria-labelledby="search-heading">
    <div className="section-heading">
      <span className="section-icon">{advanced ? <SlidersHorizontal size={18} /> : <SearchIcon size={18} />}</span>
      <div><h2 id="search-heading">{advanced ? 'Search filters' : 'Find hotel offers'}</h2><p>{advanced ? 'Price bounds are inclusive and applied by Redis.' : 'Search a city to compare the lowest available rates.'}</p></div>
    </div>
    <form onSubmit={submit} noValidate aria-describedby={error ? 'search-error' : undefined}>
      <div className={'search-fields' + (advanced ? ' advanced-fields' : '')}>
        <label>City
          <span className="input-wrap"><MapPin size={17} /><input name="city" value={draft.city} placeholder="e.g. Delhi" autoComplete="off" onChange={(event) => change('city', event.target.value)} /></span>
        </label>
        {advanced && <>
          <label>Minimum price <span className="field-unit">({currencyCode})</span><input name="minPrice" inputMode="decimal" placeholder="No minimum" value={draft.minPrice} onChange={(event) => change('minPrice', event.target.value)} /></label>
          <label>Maximum price <span className="field-unit">({currencyCode})</span><input name="maxPrice" inputMode="decimal" placeholder="No maximum" value={draft.maxPrice} onChange={(event) => change('maxPrice', event.target.value)} /></label>
        </>}
        <button className="button primary" type="submit" disabled={pending}><SearchIcon size={17} />{pending ? 'Searching…' : advanced ? 'Apply filters' : 'Search'}</button>
        {advanced && <button className="button secondary clear-button" type="button" onClick={clear} disabled={!draft.minPrice && !draft.maxPrice && !initial.minPrice && !initial.maxPrice}><X size={16} />Clear filters</button>}
      </div>
      {error && <p id="search-error" className="field-error" role="alert">{error}</p>}
    </form>
  </section>;
}
