import {useEffect, useMemo, useRef, useState} from 'react';
import {ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ReferenceArea} from 'recharts';
import {accelerate, chartRows, currentMonth, dateOnly, monthDate, originalSchedule, refinance, todayDate, validateLoan} from './loan.mjs';

const usd = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
const preciseUsd = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2});
const shortUsd = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1});
const dateFormat = new Intl.DateTimeFormat('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'});
const fullDateFormat = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
const money = value => usd.format(value);
const exactMoney = value => preciseUsd.format(value);
const dateLabel = value => dateFormat.format(value);
const percent = value => `${(value * 100).toLocaleString('en-US', {maximumFractionDigits: 3})}%`;
const duration = months => `${Math.floor(months / 12) ? `${Math.floor(months / 12)}y ` : ''}${months % 12 ? `${months % 12}mo` : months ? '' : '0mo'}`.trim();
const inputNumber = value => value.trim() === '' ? NaN : Number(value);
const metrics = [
    {key: 'balance', original: 'originalBalance', label: 'Principal outstanding', color: '#4F8CFF'},
    {key: 'principal', original: 'originalPrincipal', label: 'Principal repaid', color: '#7BDAC6'},
    {key: 'interest', original: 'originalInterest', label: 'Interest paid', color: '#F38D9C'},
];

export function EmptyState({title, detail, children}) {
    return <div className="empty-state"><div className="brand-mark">M<span>↗</span></div><h1>{title}</h1><p>{detail}</p>{children}</div>;
}
function Stat({label, value, detail, accent = ''}) {
    return <div className={`stat ${accent}`}><span className="eyebrow">{label}</span><strong>{value}</strong>{detail && <span className="stat-detail">{detail}</span>}</div>;
}
function useToday() {
    const [today, setToday] = useState(todayDate);
    useEffect(() => { const timer = setInterval(() => setToday(todayDate()), 60000); return () => clearInterval(timer); }, []);
    return today;
}

export function MortgageExplorer({properties}) {
    const [selectedId, setSelectedId] = useState(null);
    const [stateFilter, setStateFilter] = useState('');
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('payoff');
    const today = useToday();
    const states = [...new Set(properties.map(property => property.state).filter(Boolean))].sort();
    const visible = properties.filter(property => (!stateFilter || property.state === stateFilter) && `${property.name} ${property.city} ${property.state}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
    const selected = visible.find(property => property.id === selectedId) || visible[0];
    const types = [...new Set(visible.map(property => property.type))].sort();
    return <div className="explorer">
        <aside className="sidebar" aria-label="Property portfolio">
            <div className="brand"><div className="brand-mark">M<span>↗</span></div><div><strong>Mortgage studio</strong><span>PROPERTY INTELLIGENCE</span></div></div>
            <div className="portfolio-heading"><span className="eyebrow">YOUR PORTFOLIO</span><span className="count">{properties.length}</span></div>
            <label className="sr-only" htmlFor="search">Search properties</label><input id="search" className="search" type="search" placeholder="Search properties…" value={search} onChange={event => setSearch(event.target.value)} />
            <label className="filter-label" htmlFor="state-filter">Location</label><select id="state-filter" value={stateFilter} onChange={event => setStateFilter(event.target.value)}><option value="">All states</option>{states.map(state => <option key={state}>{state}</option>)}</select>
            <div className="property-list">{types.map((type, index) => <section className="property-group" key={type}>
                <h2><span className={`type-dot type-${index % 4}`} />{type}<span>{visible.filter(property => property.type === type).length}</span></h2>
                {visible.filter(property => property.type === type).map(property => <button key={property.id} className={`property-item ${selected?.id === property.id ? 'selected' : ''}`} aria-pressed={selected?.id === property.id} onClick={() => setSelectedId(property.id)}>
                    <strong>{property.name}</strong><span>{[property.city, property.state].filter(Boolean).join(', ') || 'Location not provided'}</span><span className={`type-tag tag-${index % 4}`}>{property.type}</span>
                </button>)}
            </section>)}{!visible.length && <p className="muted no-results">{properties.length ? 'No properties match your filters.' : 'No property records are available.'}</p>}</div>
            <div className="sidebar-footer"><span className="status-dot" />Read-only workspace<span>Scenarios stay in this session</span></div>
        </aside>
        <main className="main-area">
            <header className="workspace-header"><div className="breadcrumb">Portfolio <span>/</span> Loan explorer</div><span className="as-of">As of {fullDateFormat.format(today)}</span></header>
            <div className="tabs" role="tablist" aria-label="Loan analysis">{[{id: 'payoff', label: 'Payoff explorer'}, {id: 'refinance', label: 'Refinance compare'}].map(item => <button id={`tab-${item.id}`} key={item.id} role="tab" aria-selected={tab === item.id} aria-controls="analysis-panel" tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'payoff' : event.key === 'End' ? 'refinance' : tab === 'payoff' ? 'refinance' : 'payoff'; setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}>{item.label}</button>)}</div>
            {selected ? <PropertyAnalysis key={selected.id} property={selected} tab={tab} today={today} /> : <EmptyState title={properties.length ? 'No matching properties' : 'Your portfolio starts here'} detail={properties.length ? 'Adjust the state filter or search to explore a loan.' : 'Add property source records or check the table’s record access in Airtable.'} />}
        </main>
    </div>;
}

function PropertyAnalysis({property, tab, today}) {
    const error = validateLoan(property);
    return <section id="analysis-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className="property-title"><div><span className="eyebrow">{tab === 'payoff' ? 'A CLEARER PATH TO PAYOFF' : 'MAKE YOUR NEXT MOVE COUNT'}</span><h1>{property.name}</h1><p>{[property.city, property.state].filter(Boolean).join(', ')}<span className="title-dot">·</span>{property.type}</p></div><span className="readonly-badge">◈ Scenario lab</span></div>
        {error ? <div className="panel validation" role="alert"><h2>This loan needs a little more information</h2><p>{error}</p><p className="muted">Update the configured source record in Airtable. Calculations refresh automatically.</p></div> : <LoanAnalysis key={`${property.amount}:${property.rate}:${property.years}:${property.start}`} property={property} tab={tab} today={today} />}
    </section>;
}

function LoanAnalysis({property, tab, today}) {
    const original = useMemo(() => originalSchedule(property), [property.amount, property.rate, property.years, property.start]); // eslint-disable-line react-hooks/exhaustive-deps
    const current = currentMonth(original.rows, today);
    const snapshot = original.rows[current];
    const future = dateOnly(property.start) > today;
    const paidOff = snapshot.balance === 0;
    const [extraText, setExtraText] = useState('0');
    const extraValue = inputNumber(extraText);
    const extraValid = Number.isFinite(extraValue) && extraValue >= 0 && extraValue <= 1e12;
    const accelerated = useMemo(() => accelerate(property, original, current, extraValid ? extraValue : 0), [property, original, current, extraValid, extraValue]);
    const [refiRate, setRefiRate] = useState(String(Math.max(0, Number((property.rate * 100 - 1).toFixed(3)))));
    const [refiYears, setRefiYears] = useState('30');
    const [refiFees, setRefiFees] = useState('5000');
    const refi = useMemo(() => refinance(property, original, current, {rate: inputNumber(refiRate) / 100, years: inputNumber(refiYears), fees: inputNumber(refiFees)}), [property, original, current, refiRate, refiYears, refiFees]);
    const refiAvailable = !future && !paidOff;
    const refiValid = refiAvailable && !refi.error;
    const isRefi = tab === 'refinance';
    const scenario = isRefi ? refiValid ? refi.rows : original.rows : accelerated;
    const comparison = isRefi ? refiValid : extraValid && extraValue > 0 && !paidOff;
    const [pinnedMonth, setPinnedMonth] = useState(null);
    const pinned = pinnedMonth !== null ? scenario[Math.min(pinnedMonth, scenario.length - 1)] : null;
    const chartRef = useRef(null);
    const nextDate = original.rows[current + 1]?.date;
    const interestSaved = original.rows.at(-1).cumulativeInterest - accelerated.at(-1).cumulativeInterest;
    const monthsSaved = original.rows.length - accelerated.length;
    const propertyValue = typeof property.value === 'number' && property.value > 0 ? property.value : null;
    const chartData = useMemo(() => chartRows(original.rows, scenario, dateOnly(property.start)), [original, scenario, property.start]);
    return <>
        <div className="loan-facts panel">
            <Stat label="Original loan" value={money(property.amount)} />
            <Stat label="Fixed interest rate" value={percent(property.rate)} />
            <Stat label="Monthly principal + interest" value={exactMoney(original.payment)} accent="mint" />
            <Stat label="Original term" value={`${property.years} years`} />
            <Stat label="Loan start" value={dateLabel(dateOnly(property.start))} />
            <Stat label="Original payoff" value={dateLabel(original.rows.at(-1).date)} />
        </div>
        <div className="snapshot-strip"><span><span className="status-dot" />{future ? 'Loan has not started' : paidOff ? 'Scheduled loan paid off' : 'Scheduled position today'}</span><span>Balance <b>{money(snapshot.balance)}</b></span><span>Principal repaid <b>{money(snapshot.cumulativePrincipal)}</b></span><span>Loan-to-value <b>{propertyValue ? percent(snapshot.balance / propertyValue) : 'Unavailable'}</b></span></div>
        {isRefi && <div className="panel scenario-controls refi-controls"><div className="section-heading"><div><span className="eyebrow peach">EXPLORE A NEW LOAN</span><h2>Your refinance terms</h2></div><span className="quiet-chip">Local what-if</span></div>
            <div className="refi-inputs"><NumberField id="refi-rate" label="New interest rate" value={refiRate} onChange={setRefiRate} unit="%" min="0" max="100" step="0.125" disabled={!refiAvailable} /><NumberField id="refi-term" label="New loan term" value={refiYears} onChange={setRefiYears} unit="years" min="0.083333333" max="100" step="1" disabled={!refiAvailable} /><NumberField id="refi-fees" label="Upfront closing fees" value={refiFees} onChange={setRefiFees} unit="USD" min="0" max="1000000000000" step="100" disabled={!refiAvailable} /><div className="refi-balance"><span className="eyebrow">AMOUNT TO REFINANCE</span><strong>{money(snapshot.balance)}</strong><span>Fees paid in cash, not financed</span></div></div>
            <p className="helper">{future ? 'Refinancing is available once the original loan has started.' : paidOff ? 'There is no remaining balance to refinance.' : `Modeled from the scheduled balance today. First new payment: ${fullDateFormat.format(nextDate)}. The existing due-day is retained; no prorated interest is modeled.`}</p>
            {refiAvailable && refi.error && <p className="input-error" role="alert">{refi.error}</p>}
        </div>}
        <div className="panel chart-panel" ref={chartRef}>
            <div className="section-heading"><div><span className="eyebrow">THE BIG PICTURE</span><h2>{isRefi ? 'Two paths. One informed decision.' : 'Watch your debt become equity.'}</h2></div><span className="quiet-chip">{isRefi ? 'Original vs. refinance' : comparison ? 'With extra payments' : 'Contractual schedule'}</span></div>
            <div className="chart-legend">{metrics.map(metric => <span key={metric.key}><i style={{background: metric.color}} />{metric.label}</span>)}</div>
            {comparison && <p className="line-key"><span>━━</span> {isRefi ? 'Refinance plan' : 'Extra payment plan'} <span className="dashed-sample">┄┄</span> Original plan <span className="history-key">Shaded area: reconstructed history</span></p>}
            <div className="chart-wrap" aria-label="Loan timeline in US dollars">
                <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData} margin={{top: 28, right: 22, left: 4, bottom: 8}} accessibilityLayer>
                        <CartesianGrid stroke="#26344A" strokeDasharray="3 5" vertical={false} />
                        <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={value => String(new Date(value).getUTCFullYear())} tick={{fill: '#9AAAC1', fontSize: 11}} tickLine={false} axisLine={false} minTickGap={48} />
                        <YAxis tickFormatter={value => shortUsd.format(value)} tick={{fill: '#9AAAC1', fontSize: 11}} tickLine={false} axisLine={false} width={70} />
                        {!future && <ReferenceArea x1={chartData[0].date} x2={Math.min(today, chartData.at(-1).date)} fill="#9AAAC1" fillOpacity={0.045} />}
                        <Tooltip content={<ChartTooltip />} cursor={{stroke: '#9AAAC1', strokeDasharray: '3 4'}} />
                        {comparison && metrics.map(metric => <Line key={metric.original} dataKey={metric.original} name={`Original · ${metric.label}`} stroke={metric.color} strokeWidth={1.6} strokeOpacity={0.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />)}
                        {metrics.map(metric => <Line key={metric.key} dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2.6} dot={false} activeDot={{r: 4, stroke: '#101A2B', strokeWidth: 2}} isAnimationActive={false} />)}
                        {today >= chartData[0].date && today <= chartData.at(-1).date && <ReferenceLine x={today} stroke="#A78BFA" strokeDasharray="4 4" label={{value: 'TODAY', position: 'insideTopLeft', fill: '#A78BFA', fontSize: 10}} />}
                        {isRefi && refiValid && refi.breakEvenMonth !== null && <ReferenceLine x={monthDate(dateOnly(property.start), refi.breakEvenMonth)} stroke="#F2BD86" strokeDasharray="4 3" label={{value: 'FEES RECOVERED', position: 'insideTopLeft', dy: 18, fill: '#F2BD86', fontSize: 10}} />}
                        {pinned && <ReferenceLine x={pinned.date} stroke="#EDF2FA" strokeOpacity={0.6} />}
                        {pinned && <ReferenceDot x={pinned.date} y={pinned.balance} r={5} fill="#4F8CFF" stroke="#EDF2FA" />}
                    </LineChart>
                </ResponsiveContainer>
                {pinned && <div className="pinned-tooltip" role="status"><button className="close-pin" aria-label="Clear selected month" onClick={() => setPinnedMonth(null)}>×</button><strong>Month {pinned.month} · {fullDateFormat.format(pinned.date)}</strong><span>Payment <b>{exactMoney(pinned.payment)}</b></span><span>Principal repaid <b>{exactMoney(pinned.cumulativePrincipal)}</b></span><span>Interest paid <b>{exactMoney(pinned.cumulativeInterest)}</b></span><span>Balance <b>{exactMoney(pinned.balance)}</b></span></div>}
            </div>
            <p className="chart-caption">{isRefi ? 'Both paths share the same payment history. Cumulative totals include payments before refinancing.' : 'Cumulative principal and interest start at origination. Extra payments only affect future installments.'} Amounts in USD.</p>
        </div>
        {!isRefi ? <>
            <div className="panel scenario-controls extra-controls"><div className="section-heading"><div><span className="eyebrow mint">A LITTLE EXTRA GOES A LONG WAY</span><h2>Put more toward your principal</h2><p className="helper">{paidOff ? 'This loan has no remaining scheduled payments.' : `Extra principal begins ${fullDateFormat.format(nextDate)}. No historical extra payments assumed.`}</p></div><NumberField id="extra-payment" label="Extra each month" value={extraText} onChange={setExtraText} unit="USD" min="0" max="1000000000000" step="50" disabled={paidOff} /></div>
                <label htmlFor="extra-slider" className="sr-only">Extra monthly principal payment</label><input id="extra-slider" type="range" min="0" max={Math.max(5000, Math.ceil(original.payment * 2 / 1000) * 1000, extraValid ? extraValue : 0)} step="50" value={extraValid ? extraValue : 0} disabled={paidOff} onChange={event => setExtraText(event.target.value)} aria-valuetext={`${money(extraValid ? extraValue : 0)} extra per month`} /><div className="range-labels"><span>$0 extra</span><span>Drag to explore your payoff</span><span>{money(Math.max(5000, Math.ceil(original.payment * 2 / 1000) * 1000, extraValid ? extraValue : 0))}</span></div>
                {!extraValid ? <p role="alert" className="input-error">Enter an extra payment from $0 to $1 trillion. The chart shows your original schedule until this is valid.</p> : <div className="results-grid"><Stat label="Planned monthly payment" value={exactMoney(paidOff ? 0 : original.payment + extraValue)} detail="Final payment may be smaller" /><Stat label="Interest saved" value={money(interestSaved)} detail="Over the remaining loan" accent="mint" /><Stat label="Time saved" value={duration(monthsSaved)} detail="Compared with original payoff" accent="lavender" /><Stat label="New payoff date" value={dateLabel(accelerated.at(-1).date)} detail={comparison ? `Originally ${dateLabel(original.rows.at(-1).date)}` : 'Matches your original plan'} accent="peach" /></div>}
            </div>
            <ScheduleTable key={property.id} rows={scenario} current={current} selectedMonth={pinned?.month} onSelect={row => { setPinnedMonth(row.month); chartRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'}); }} />
        </> : refiValid ? <>
            <div className={`refi-verdict ${refi.netSavings < 0 ? 'costlier' : ''}`}><div className="verdict-symbol">{refi.netSavings > 0 ? '↗' : refi.netSavings < 0 ? '↘' : '↔'}</div><div><span className="eyebrow">THE COST PERSPECTIVE</span><h2>{refi.netSavings > 0 ? `${money(refi.netSavings)} less over the remaining loan life` : refi.netSavings < 0 ? `${money(-refi.netSavings)} more over the remaining loan life` : 'The two plans have the same remaining cost'}</h2><p>{refi.monthlySavings >= 0 ? `Monthly payment falls by ${exactMoney(refi.monthlySavings)}.` : `Monthly payment rises by ${exactMoney(-refi.monthlySavings)}.`} Includes {money(inputNumber(refiFees))} in upfront fees. {refi.monthlySavings > 0 && refi.netSavings < 0 ? 'The lower payment does not translate to overall savings.' : 'Compare both the monthly commitment and the total cost.'}</p></div></div>
            <div className="panel results-grid refinance-results"><Stat label="New monthly payment" value={exactMoney(refi.payment)} detail={`Current: ${exactMoney(original.payment)}`} accent="mint" /><Stat label="Fees recovered through interest" value={refi.breakEvenMonth === null ? 'Not recovered' : refi.breakEvenMonth === current ? 'Immediately' : `${refi.breakEvenMonth - current} months`} detail={refi.breakEvenMonth === null ? 'No lasting break-even over both plans' : fullDateFormat.format(monthDate(dateOnly(property.start), refi.breakEvenMonth))} accent="peach" /><Stat label="New payoff date" value={dateLabel(refi.rows.at(-1).date)} detail={`${duration(refi.rows.length - 1 - current)} from the scheduled balance`} accent="lavender" /></div>
            <div className="panel comparison-table"><div className="section-heading"><div><span className="eyebrow">FROM TODAY TO PAYOFF</span><h2>What each path costs</h2></div></div><table><thead><tr><th scope="col">Remaining cost</th><th scope="col">Keep current loan</th><th scope="col">Refinance</th></tr></thead><tbody><tr><th scope="row">Principal to repay</th><td>{exactMoney(snapshot.balance)}</td><td>{exactMoney(snapshot.balance)}</td></tr><tr><th scope="row">Future interest</th><td>{exactMoney(refi.originalInterest)}</td><td>{exactMoney(refi.newInterest)}</td></tr><tr><th scope="row">Upfront fees</th><td>$0.00</td><td>{exactMoney(inputNumber(refiFees))}</td></tr><tr className="total-row"><th scope="row">Total remaining outlay</th><td>{exactMoney(refi.originalRemainingCost)}</td><td>{exactMoney(refi.newRemainingCost)}</td></tr></tbody></table>
                <p className="helper">Fee recovery means cumulative interest avoided covers the upfront fees and remains ahead through both payoff dates. This is an interest-cost break-even, not fees divided by monthly payment savings. Totals are nominal; taxes, time value of money and selling the property early are not modeled.</p>
            </div>
        </> : null}
        <footer className="assumptions"><p>Scheduled loan values assume contractual payments were made as agreed and may differ from the lender&apos;s actual servicing balance.</p><details><summary>Calculation assumptions</summary><p>Fixed-rate, fully amortizing monthly loan. First payment is one month after the loan start date; due dates are clamped to the last day of shorter months. Payments due today count as paid. No historical extra payments, missed payments, deferments, modifications, capitalized fees or variable rates. No escrow, property taxes, insurance or PMI. Payments round to cents; the final payment settles any rounding residual. Refinance begins at the next contractual payment date with no partial-period interest. Extra-payment and refinance scenarios are independent and never change Airtable records.</p></details></footer>
    </>;
}
function NumberField({id, label, value, onChange, unit, ...props}) {
    return <label className="number-field" htmlFor={id}><span>{label}</span><div><input id={id} type="number" inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} {...props} /><span>{unit}</span></div></label>;
}
function ChartTooltip({active, payload, label}) {
    if (!active || !payload?.length) return null;
    return <div className="chart-tooltip"><strong>{dateLabel(label)}</strong>{payload.map(item => <span key={item.dataKey}><i style={{background: item.color}} />{item.name}<b>{money(item.value)}</b></span>)}</div>;
}
function ScheduleTable({rows, current, selectedMonth, onSelect}) {
    const [scope, setScope] = useState('all');
    const [page, setPage] = useState(0);
    const filtered = rows.slice(1).filter(row => scope === 'all' || (scope === 'future' ? row.month > current : row.month <= current));
    const pages = Math.max(1, Math.ceil(filtered.length / 24));
    const safePage = Math.min(page, pages - 1);
    const visible = filtered.slice(safePage * 24, safePage * 24 + 24);
    return <div className="panel schedule-panel"><div className="section-heading"><div><span className="eyebrow">MONTH BY MONTH</span><h2>Your payment breakdown</h2><p className="helper">Select any row to inspect that month on the chart.</p></div><label><span className="sr-only">Schedule period</span><select value={scope} onChange={event => { setScope(event.target.value); setPage(0); }}><option value="all">All payments</option><option value="future">Upcoming payments</option><option value="past">Scheduled history</option></select></label></div>
        <div className="table-scroll"><table><thead><tr>{['Month', 'Payment date', 'Payment', 'Principal', 'Interest', 'Principal repaid', 'Interest paid', 'Balance'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.month} className={`${row.month === selectedMonth ? 'selected-row' : ''} ${row.month <= current ? 'historical-row' : ''}`} tabIndex={0} aria-label={`Inspect month ${row.month}, ${fullDateFormat.format(row.date)}`} onClick={() => onSelect(row)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row); } }}><td><span className="month-cell">{String(row.month).padStart(2, '0')}{row.month === current && <span className="current-tag">Latest</span>}</span></td><td>{fullDateFormat.format(row.date)}</td><td>{exactMoney(row.payment)}</td><td>{exactMoney(row.principal)}</td><td>{exactMoney(row.interest)}</td><td>{exactMoney(row.cumulativePrincipal)}</td><td>{exactMoney(row.cumulativeInterest)}</td><td className="balance-cell">{exactMoney(row.balance)}</td></tr>)}</tbody></table>{!filtered.length && <p className="no-results muted">No payments in this period.</p>}</div>
        <div className="pagination"><span>{filtered.length ? `${safePage * 24 + 1}–${Math.min((safePage + 1) * 24, filtered.length)} of ${filtered.length} payments` : '0 payments'}</span><div><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous schedule page">←</button><span>{safePage + 1} / {pages}</span><button disabled={safePage === pages - 1} onClick={() => setPage(safePage + 1)} aria-label="Next schedule page">→</button></div></div>
    </div>;
}
