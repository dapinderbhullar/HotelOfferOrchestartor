import { BarChart, Bar, CartesianGrid, Cell, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Building2, Coins, SlidersHorizontal, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api';
import type { OffersQuery } from '../components/OfferResults';
import { Notice, PageIntro, PanelState, PartialNotice, Stat } from '../components/ui';
import { cityName, distribution, money, summarize } from '../data';
import type { Search } from '../types';

const colors = ['#108263', '#8771ca'];
const axes = { fill: '#536860', fontSize: 12 };
const tooltip = { borderRadius: 12, border: '1px solid #dfe8e3', boxShadow: '0 8px 24px #152c1f12', fontSize: 13 };
const abbreviated = (value: string) => value.length > 18 ? value.slice(0, 17) + '…' : value;

export function Analytics({ query, search, invalid, queryString }: { query: OffersQuery; search: Search; invalid: string; queryString: string }) {
  const offers = query.data?.offers ?? [];
  const stats = summarize(offers);
  const cheapest = [...offers].sort((a, b) => a.price - b.price).slice(0, 5);
  const suppliers = (['Supplier A', 'Supplier B'] as const).map((name) => ({ name, value: offers.filter((offer) => offer.supplier === name).length }));
  return <>
    <div className="page-heading-row"><PageIntro title="Price analytics" description={'Current search results' + (search.city ? ' for ' + cityName(search.city) : '') + '. Prices reflect the returned snapshot.'} />
      <Link className="button secondary" to={'/hotels' + queryString}><SlidersHorizontal size={16} /> Search filters</Link></div>
    {query.data && <PartialNotice suppliers={query.data.failedSuppliers} />}
    {query.isError && <Notice tone="red">{errorMessage(query.error)} <button className="text-button" onClick={() => void query.refetch()}>Retry</button></Notice>}
    {invalid ? <div className="card"><PanelState title="Update your search" description={invalid} /></div>
      : query.isPending ? <div className="card"><PanelState title="Loading price analytics…" loading /></div>
      : !stats ? <div className="card"><PanelState title={query.isError ? 'Analytics unavailable' : 'No prices to analyze'} description="Search for a city or widen the price range." /></div>
      : <>
        <div className="stat-grid analytics-stats">
          <Stat label="Average price" value={money(stats.average)} detail="Mean across returned offers" icon={Coins} />
          <Stat label="Lowest price" value={money(stats.min)} detail={cheapest[0].name} icon={Tag} tone="blue" />
          <Stat label="Hotels in view" value={offers.length} detail="Offers in the current search" icon={Building2} tone="violet" />
        </div>
        <div className="chart-grid">
          <section className="card chart-card">
            <div className="section-heading"><span className="section-icon"><BarChart3 size={18} /></span><div><h2>Price distribution</h2><p>Number of offers in each price band</p></div></div>
            <div className="chart-frame" role="img" aria-label="Hotel offer count by price band">
              <ResponsiveContainer><BarChart data={distribution(offers)} margin={{ top: 12, left: -20, right: 6, bottom: 5 }}>
                <CartesianGrid vertical={false} stroke="#e7efea" /><XAxis dataKey="label" tick={axes} tickLine={false} axisLine={false} tickFormatter={(value: string) => value.split('–')[0]} />
                <YAxis allowDecimals={false} tick={axes} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltip} cursor={{ fill: '#eff7f3' }} />
                <Bar dataKey="count" name="Hotels" fill={colors[0]} radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false} />
              </BarChart></ResponsiveContainer>
            </div>
            <ul className="sr-only">{distribution(offers).map((item) => <li key={item.label}>{item.label}, {item.count} offers</li>)}</ul>
          </section>
          <section className="card chart-card">
            <h2>Supplier distribution</h2><p>Share of returned cheapest offers</p>
            <div className="chart-frame donut-frame" role="img" aria-label="Offer counts by supplier">
              <ResponsiveContainer><PieChart><Pie data={suppliers} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="81%" paddingAngle={4} isAnimationActive={false}>
                {suppliers.map(({ name }, index) => <Cell key={name} fill={colors[index]} />)}
              </Pie><Tooltip contentStyle={tooltip} /></PieChart></ResponsiveContainer>
              <div className="donut-center" aria-hidden="true"><strong>{offers.length}</strong><span>offers</span></div>
            </div>
            <ul className="chart-legend">{suppliers.map(({ name, value }, index) => <li key={name}><span className="legend-dot" style={{ background: colors[index] }} />{name}<strong>{value}</strong></li>)}</ul>
          </section>
          <section className="card chart-card ranking-card">
            <h2>Cheapest hotels</h2><p>Compare the five lowest-priced offers in this search</p>
            <div className="chart-frame rank-frame" role="img" aria-label="Top five cheapest hotels by price">
              <ResponsiveContainer><BarChart data={cheapest} layout="vertical" margin={{ top: 8, right: 12, left: 6, bottom: 2 }}>
                <CartesianGrid horizontal={false} stroke="#e7efea" /><XAxis type="number" tick={axes} tickFormatter={(value: number) => money(value)} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={126} tick={axes} tickFormatter={abbreviated} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltip} formatter={(value) => money(Number(value))} cursor={{ fill: '#eff7f3' }} />
                <Bar dataKey="price" name="Price" fill={colors[0]} radius={[0, 6, 6, 0]} maxBarSize={23} isAnimationActive={false} />
              </BarChart></ResponsiveContainer>
            </div>
            <ol className="sr-only">{cheapest.map((offer) => <li key={offer.name}>{offer.name}, {money(offer.price)}</li>)}</ol>
          </section>
        </div>
      </>}
  </>;
}
