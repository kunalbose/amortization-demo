import test from 'node:test';
import assert from 'node:assert/strict';
import {accelerate, cents, chartRows, currentMonth, dateOnly, monthDate, monthlyPayment, originalSchedule, refinance, validateLoan} from '../frontend/loan.mjs';
const loan = {amount: 300000, rate: .06, years: 30, start: '2020-01-31'};
const base = originalSchedule(loan);
const near = (actual, expected, tolerance = .011) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);

test('standard mortgage formula, first installment, and accounting conservation', () => {
    assert.equal(base.payment, 1798.65);
    assert.equal(base.rows.length, 361);
    assert.equal(base.rows[1].interest, 1500);
    assert.equal(base.rows[1].principal, 298.65);
    assert.equal(base.rows.at(-1).balance, 0);
    assert.equal(base.rows.at(-1).cumulativePrincipal, loan.amount);
    for (const row of base.rows) {
        near(row.principal + row.interest, row.payment);
        near(row.cumulativePrincipal + row.balance, loan.amount);
        assert.ok(row.balance >= 0);
    }
    near(base.rows.slice(1).reduce((sum, row) => sum + row.payment, 0), loan.amount + base.rows.at(-1).cumulativeInterest);
});
test('zero and near-zero rates, final payment rounding', () => {
    const result = originalSchedule({...loan, rate: 0, amount: 1000, years: 1});
    assert.equal(result.payment, 83.33);
    assert.equal(result.rows.at(-1).payment, 83.37);
    assert.equal(result.rows.at(-1).cumulativeInterest, 0);
    near(monthlyPayment(300000, 1e-12, 360), 300000 / 360);
});
test('month-end and leap-year dates retain original anchor; first payment is month one', () => {
    assert.equal(new Date(base.rows[1].date).toISOString().slice(0, 10), '2020-02-29');
    assert.equal(new Date(base.rows[2].date).toISOString().slice(0, 10), '2020-03-31');
    assert.equal(new Date(monthDate(dateOnly('2024-02-29'), 12)).toISOString().slice(0, 10), '2025-02-28');
    assert.equal(currentMonth(base.rows, dateOnly('2020-02-28')), 0);
    assert.equal(currentMonth(base.rows, dateOnly('2020-02-29')), 1);
});
test('future and matured loans reconstruct safely', () => {
    assert.equal(currentMonth(base.rows, dateOnly('2019-01-01')), 0);
    assert.equal(currentMonth(base.rows, dateOnly('2090-01-01')), 360);
    assert.deepEqual(accelerate(loan, base, 360, 500), base.rows);
    assert.ok(refinance(loan, base, 360, {rate: .04, years: 30, fees: 5000}).error);
});
test('extra payments preserve all history, conserve principal and shorten payoff', () => {
    const accelerated = accelerate(loan, base, 60, 500);
    assert.deepEqual(accelerated.slice(0, 61), base.rows.slice(0, 61));
    assert.equal(accelerated[61].payment, base.payment + 500);
    assert.ok(accelerated.length < base.rows.length);
    assert.ok(accelerated.at(-1).cumulativeInterest < base.rows.at(-1).cumulativeInterest);
    assert.equal(accelerated.at(-1).balance, 0);
    assert.equal(accelerated.at(-1).cumulativePrincipal, loan.amount);
    assert.deepEqual(accelerate(loan, base, 60, 0), base.rows);
});
test('huge extra payment is capped at payoff balance plus interest', () => {
    const rows = accelerate(loan, base, 60, 1e9);
    assert.equal(rows.length, 62);
    assert.equal(rows.at(-1).balance, 0);
    near(rows.at(-1).payment, base.rows[60].balance + cents(base.rows[60].balance * .06 / 12));
});
test('refinance keeps history, charges fees in cash and recovers fees on matched dates', () => {
    const result = refinance(loan, base, 60, {rate: .04, years: 20, fees: 5000});
    assert.deepEqual(result.rows.slice(0, 61), base.rows.slice(0, 61));
    assert.equal(result.rows.at(-1).cumulativePrincipal, loan.amount);
    near(result.newRemainingCost, base.rows[60].balance + result.newInterest + 5000);
    assert.ok(result.netSavings > 0);
    assert.ok(result.breakEvenMonth > 60);
    const at = result.breakEvenMonth;
    assert.ok(base.rows[at].cumulativeInterest - result.rows[at].cumulativeInterest >= 5000);
    assert.ok(base.rows[at - 1].cumulativeInterest - result.rows[at - 1].cumulativeInterest < 5000);
});
test('lower payments can cost more; extended-term comparison runs through both payoffs', () => {
    const result = refinance(loan, base, 240, {rate: .055, years: 30, fees: 5000});
    assert.ok(result.monthlySavings > 0);
    assert.ok(result.netSavings < 0);
    assert.equal(result.breakEvenMonth, null);
    const points = chartRows(base.rows, result.rows, dateOnly(loan.start));
    assert.equal(points.length, 601);
    assert.equal(points.at(-1).originalBalance, 0);
    assert.equal(points.at(-1).originalInterest, base.rows.at(-1).cumulativeInterest);
});
test('same terms are neutral without fees and worse with fees', () => {
    const neutral = refinance(loan, base, 0, {rate: .06, years: 30, fees: 0});
    assert.equal(neutral.netSavings, 0);
    assert.equal(neutral.breakEvenMonth, 0);
    const costly = refinance(loan, base, 0, {rate: .06, years: 30, fees: 5000});
    assert.equal(costly.netSavings, -5000);
    assert.equal(costly.breakEvenMonth, null);
});
test('reject missing, non-finite and invalid inputs rather than coercing blanks to zero', () => {
    for (const changes of [{amount: null}, {amount: 0}, {rate: null}, {rate: -1}, {years: 0}, {years: 1.01}, {years: Infinity}, {start: '2020-02-30'}, {start: null}]) assert.ok(validateLoan({...loan, ...changes}));
    assert.equal(validateLoan({...loan, rate: 0}), null);
    assert.ok(refinance(loan, base, 60, {rate: NaN, years: 30, fees: 0}).error);
    assert.ok(refinance(loan, base, 60, {rate: 0, years: 30, fees: -1}).error);
    assert.throws(() => accelerate(loan, base, 60, -1));
});
