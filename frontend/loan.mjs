// Pure, read-only calculations. Round to cents at each installment.
export const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function dateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return NaN;
    const part = value.slice(0, 10);
    const result = Date.parse(`${part}T00:00:00Z`);
    return Number.isFinite(result) && new Date(result).toISOString().slice(0, 10) === part ? result : NaN;
}
export function todayDate() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}
export function monthDate(start, month) {
    const date = new Date(start);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + month + 1, 0)).getUTCDate();
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + month, Math.min(date.getUTCDate(), lastDay));
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function validateLoan(loan) {
    if (!finite(loan.amount) || loan.amount < 0.01 || loan.amount > 1e12) return 'Enter a loan amount between $0.01 and $1 trillion in the source record.';
    if (!finite(loan.rate) || loan.rate < 0 || loan.rate > 1) return 'Enter an annual interest rate from 0% to 100% in the source record.';
    if (!finite(loan.years) || loan.years <= 0 || loan.years > 100 || Math.abs(loan.years * 12 - Math.round(loan.years * 12)) > 1e-7) return 'Enter a loan term of 1–1,200 whole months (expressed in years) in the source record.';
    if (!Number.isFinite(dateOnly(loan.start))) return 'Enter a valid loan start date in the source record.';
    return null;
}
export function monthlyPayment(amount, annualRate, months) {
    if (!amount) return 0;
    const r = annualRate / 12;
    return cents(r === 0 ? amount / months : amount * r / -Math.expm1(-months * Math.log1p(r)));
}
function initialRow(amount, date) {
    return {month: 0, date, payment: 0, principal: 0, interest: 0, cumulativePrincipal: 0, cumulativeInterest: 0, balance: cents(amount)};
}
function extendSchedule(history, {rate, months, payment, extra = 0, start}) {
    const rows = [...history];
    const offset = rows.at(-1).month;
    for (let i = 1; i <= months && rows.at(-1).balance > 0; i++) {
        const previous = rows.at(-1);
        const interest = cents(previous.balance * rate / 12);
        const paid = i === months ? cents(previous.balance + interest) : Math.min(cents(payment + extra), cents(previous.balance + interest));
        const principal = cents(paid - interest);
        rows.push({month: offset + i, date: monthDate(start, offset + i), payment: paid, principal, interest,
            cumulativePrincipal: cents(previous.cumulativePrincipal + principal),
            cumulativeInterest: cents(previous.cumulativeInterest + interest),
            balance: Math.max(0, cents(previous.balance - principal))});
    }
    return rows;
}
export function originalSchedule(loan) {
    const error = validateLoan(loan);
    if (error) throw new Error(error);
    const months = Math.round(loan.years * 12);
    const payment = monthlyPayment(loan.amount, loan.rate, months);
    const start = dateOnly(loan.start);
    return {payment, rows: extendSchedule([initialRow(loan.amount, start)], {rate: loan.rate, months, payment, start})};
}
export function currentMonth(rows, today) {
    let current = 0;
    for (let i = 1; i < rows.length && rows[i].date <= today; i++) current = i;
    return current;
}
export function accelerate(loan, original, current, extra) {
    if (!finite(extra) || extra < 0 || extra > 1e12) throw new Error('Enter an extra payment from $0 to $1 trillion.');
    return extendSchedule(original.rows.slice(0, current + 1), {rate: loan.rate, months: original.rows.length - 1 - current, payment: original.payment, extra: cents(extra), start: dateOnly(loan.start)});
}
export function refinance(loan, original, current, {rate, years, fees}) {
    if (!finite(rate) || rate < 0 || rate > 1) return {error: 'Enter a new annual rate from 0% to 100%.'};
    if (!finite(years) || years <= 0 || years > 100 || Math.abs(years * 12 - Math.round(years * 12)) > 1e-7) return {error: 'Enter a new term of 1–1,200 whole months, expressed in years.'};
    if (!finite(fees) || fees < 0 || fees > 1e12) return {error: 'Enter upfront fees from $0 to $1 trillion.'};
    const balance = original.rows[current].balance;
    if (!balance) return {error: 'This loan is already paid off under the scheduled payment assumptions.'};
    const payment = monthlyPayment(balance, rate, Math.round(years * 12));
    const rows = extendSchedule(original.rows.slice(0, current + 1), {rate, months: Math.round(years * 12), payment, start: dateOnly(loan.start)});
    const historyInterest = original.rows[current].cumulativeInterest;
    const originalInterest = cents(original.rows.at(-1).cumulativeInterest - historyInterest);
    const newInterest = cents(rows.at(-1).cumulativeInterest - historyInterest);
    const netSavings = cents(originalInterest - newInterest - fees);
    // Compare interest costs at equal calendar months, carrying totals after payoff.
    // Require recovery to persist through both payoffs: a longer term can reverse it.
    const horizon = Math.max(original.rows.length, rows.length) - 1;
    let breakEvenMonth = null;
    for (let month = horizon; month >= current; month--) {
        const oldRow = original.rows[Math.min(month, original.rows.length - 1)];
        const newRow = rows[Math.min(month, rows.length - 1)];
        if (cents(oldRow.cumulativeInterest - newRow.cumulativeInterest - fees) < 0) break;
        breakEvenMonth = month;
    }
    return {rows, payment, originalInterest, newInterest, netSavings, breakEvenMonth,
        monthlySavings: cents(original.payment - payment),
        originalRemainingCost: cents(balance + originalInterest), newRemainingCost: cents(balance + newInterest + fees)};
}
export function chartRows(original, scenario, start) {
    return Array.from({length: Math.max(original.length, scenario.length)}, (_, month) => {
        const oldRow = original[Math.min(month, original.length - 1)];
        const row = scenario[Math.min(month, scenario.length - 1)];
        return {month, date: monthDate(start, month), balance: row.balance, principal: row.cumulativePrincipal, interest: row.cumulativeInterest,
            originalBalance: oldRow.balance, originalPrincipal: oldRow.cumulativePrincipal, originalInterest: oldRow.cumulativeInterest};
    });
}
