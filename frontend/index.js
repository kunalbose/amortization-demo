import {Component, Suspense, useState} from 'react';
import {initializeBlock, useBase, useCustomProperties, useGlobalConfig, useRecords} from '@airtable/blocks/interface/ui';
import {createCustomPropertiesGetter, fieldSpecs, fieldKey, TABLE_KEY} from './properties';
import {MortgageExplorer, EmptyState} from './MortgageExplorer';
import './style.css';

class ReadErrorBoundary extends Component {
    state = {error: null};
    static getDerivedStateFromError(error) { return {error}; }
    render() {
        if (this.state.error) return <EmptyState title="Unable to load loan data" detail="Check the element’s table and field access, then reload this extension." />;
        return this.props.children;
    }
}

function PropertyRecords({table, fields}) {
    const records = useRecords(table);
    const properties = records.map(record => ({
        id: record.id,
        name: record.getCellValueAsString(fields.name) || 'Unnamed property',
        city: record.getCellValueAsString(fields.city),
        state: record.getCellValueAsString(fields.state),
        type: record.getCellValueAsString(fields.type) || 'Uncategorized',
        amount: record.getCellValue(fields.amount), rate: record.getCellValue(fields.rate),
        years: record.getCellValue(fields.years), start: record.getCellValue(fields.start), value: record.getCellValue(fields.value),
    }));
    return <MortgageExplorer properties={properties} />;
}

function ConfiguredExtension({selectedTableId}) {
    const base = useBase();
    // This SDK initializes definitions once, then refreshes on schema changes.
    // The parent remounts this scope when the builder changes the table.
    const [getCustomProperties] = useState(() => createCustomPropertiesGetter(selectedTableId));
    const {customPropertyValueByKey: values, errorState} = useCustomProperties(getCustomProperties);
    const table = values[TABLE_KEY];
    const fields = {};
    const missing = [];
    const tableIsValid = table && base.tables.some(candidate => candidate === table);
    if (tableIsValid) {
        for (const spec of fieldSpecs) {
            const field = values[fieldKey(table, spec.key)];
            if (!field || !table.fields.includes(field) || !spec.types.includes(field.type)) missing.push(spec.label);
            else fields[spec.key] = field;
        }
    }
    if (errorState || !tableIsValid || missing.length) {
        return <EmptyState title="Connect your property portfolio" detail="Configure the Properties Table and required loan fields in the element properties panel.">
            {errorState && <p role="alert">Configuration error: {errorState.error?.message || 'Unable to load custom properties.'}</p>}
            {!!missing.length && <p className="muted">Still needed: {missing.join(', ')}.</p>}
        </EmptyState>;
    }
    return <ReadErrorBoundary key={Object.values(fields).map(field => field.id).join(':')}>
        <Suspense fallback={<EmptyState title="Loading your portfolio…" detail="Reading the configured property records." />}>
            <PropertyRecords table={table} fields={fields} />
        </Suspense>
    </ReadErrorBoundary>;
}

function App() {
    // Observe the persisted table custom property through the public SDK hook.
    // Never write source records or scenario values to Airtable or global config.
    const config = useGlobalConfig();
    const selection = config.get(TABLE_KEY);
    const selectedTableId = typeof selection === 'string' ? selection : undefined;
    return <ConfiguredExtension key={selectedTableId || 'default'} selectedTableId={selectedTableId} />;
}

initializeBlock({interface: () => <ReadErrorBoundary><App /></ReadErrorBoundary>});
