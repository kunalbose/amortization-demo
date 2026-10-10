# Mortgage studio

A read-only Airtable Interface Extension for property loan amortization, extra monthly principal payments, and refinance comparisons. Built in JavaScript with React 19, the installed Interface SDK, and Recharts.

## Develop and preview

```sh
npm install
block run
```

In Airtable Interfaces, select this custom element, choose **Develop**, and use the local URL printed by the CLI. Save frontend files to update the development preview. Keep the development server running. If authentication is needed, run `block set-api-key` with an Airtable PAT that has `block:manage`; never put a token in frontend code. `block release` publishes a release when you are ready.

The existing `block.json` and `.block/remote.json` are preserved.

Run only one `block run` process per checkout, even when using different ports. The CLI owns the shared `.tmp` directory and removes it during shutdown. Stopping a second server can therefore delete the first server's generated entrypoint. If `.tmp/index.js` cannot be resolved, stop all development servers for this checkout, wait for shutdown, then run `block run` once. Do not edit or keep other artifacts in `.tmp`.

## Configure the element

In the element properties panel select **Properties Table**, followed by the nine field mappings: Property Name, City, State, Property Type, Loan Amount, Interest Rate, Loan Term, Loan Start Date, and Current Property Value. Expected names are used only to choose smart defaults. All record reads use the configured Field objects.

Changing the selected table rebuilds the dependent field pickers. Field mappings are stored under per-table keys, so previous mappings are retained if the builder switches back. `shouldFieldBeAllowed` filters choices using `FieldType`. Invalid/missing mappings show setup guidance; missing or invalid numeric record values show an explanation instead of calculating with zeros.

The installed SDK's `useCustomProperties` callback receives only `base` and initializes definitions once, then refreshes on schema changes. There is no supported dependent-table syntax in this version. `useGlobalConfig` observes only the table custom property's selection; a keyed child remount constructs a stable, externally defined getter scoped to that selection. This avoids multiple competing custom-property registrations or private SDK methods.

## Modeling choices

- USD amounts; percent cells are annual decimal rates (6% is `0.06`).
- Fixed monthly principal and interest, first installment one calendar month after origination. Due dates clamp to shorter months without drifting the original day.
- All payments due on or before today's local calendar date are assumed paid. The UI refreshes its as-of date every minute.
- Monthly payments and interest round to cents; the last payment settles the remaining balance and any rounding difference.
- Extra payments begin at the next scheduled due date. Historical payments never change. The final payment is capped at the remaining balance plus interest.
- Refinancing uses today's reconstructed scheduled balance, keeps the original due-day, and begins payments at the next contractual due date. There is no prorated/stub-period interest calculation. Fees are paid upfront in cash, not capitalized. Refinancing is disabled for future-start and paid-off loans.
- The chart includes original payment history and both projected paths, carrying cumulative totals after either payoff.
- **Fee recovery is interest-cost break-even**: cumulative interest avoided covers fees and remains nonnegative through both payoff dates. It is not the common fees / monthly-payment-savings cash-flow estimate. A term extension can reduce the monthly payment but cost more overall; the verdict explicitly compares all remaining principal, interest, and fees. Values are nominal; taxes, time value of money and sale before payoff are not modeled.
- No lender transaction history, historical extra payments, missed payments, deferments, modifications, capitalized fees, variable rates, escrow, property taxes, insurance or PMI.
- Scenarios live only in React state and reset when changing properties. No Airtable records, formulas, tables, automations, or scripts are created or modified.

## Verification

```sh
npm test
npm run lint
```

Engine tests cover a known mortgage, conservation of principal and payments, zero and near-zero interest, rounding, calendar boundaries, future/matured loans, historical preservation, extra-payment payoff limits, fees, refinance break-even, extended terms, and invalid data.

For an Airtable acceptance check: configure the mappings, select a different table and verify its field choices, rename fields, clear a required mapping, restrict field access, and edit a source record. Check both tabs, state/search filters, slider, refinance inputs, and selecting a schedule row. Standalone visual fixtures are test-only and must stay outside the CLI-owned `.tmp` directory and the Airtable bundle.
