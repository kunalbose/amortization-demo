import {FieldType} from '@airtable/blocks/interface/models';

export const TABLE_KEY = 'propertiesTable';
const textTypes = [FieldType.SINGLE_LINE_TEXT, FieldType.MULTILINE_TEXT, FieldType.RICH_TEXT];
const moneyTypes = [FieldType.CURRENCY, FieldType.NUMBER];
export const fieldSpecs = [
    {key: 'name', label: 'Property Name Field', types: textTypes},
    {key: 'city', label: 'City Field', types: textTypes},
    {key: 'state', label: 'State Field', types: textTypes},
    {key: 'type', label: 'Property Type Field', types: [FieldType.SINGLE_SELECT]},
    {key: 'amount', label: 'Loan Amount Field', types: moneyTypes},
    {key: 'rate', label: 'Interest Rate Field', types: [FieldType.PERCENT]},
    {key: 'years', label: 'Loan Term Field', types: [FieldType.NUMBER]},
    {key: 'start', label: 'Loan Start Date Field', types: [FieldType.DATE, FieldType.DATE_TIME]},
    {key: 'value', label: 'Current Property Value Field', types: moneyTypes},
];

// Per-table keys preserve mappings and prevent reusing a foreign field.
export const fieldKey = (table, key) => `${table.id}_${key}`;

export function createCustomPropertiesGetter(selectedTableId) {
    return function getCustomProperties(base) {
        // Schema names are used ONLY here to suggest builder defaults.
        const defaultTable = base.tables.find(table => table.name === 'Properties');
        const table = selectedTableId ? base.getTableByIdIfExists(selectedTableId) : defaultTable;
        const definitions = [{key: TABLE_KEY, label: 'Properties Table', type: 'table', defaultValue: table || undefined}];
        if (!table) return definitions;
        const names = {name: 'Property Name', city: 'City', state: 'State', type: 'Property Type', amount: 'Loan Amount', rate: 'Interest Rate', years: 'Loan Term Years', start: 'Loan Start Date', value: 'Current Property Value'};
        for (const spec of fieldSpecs) {
            definitions.push({
                key: fieldKey(table, spec.key), label: spec.label, type: 'field', table,
                shouldFieldBeAllowed: field => spec.types.includes(field.config.type),
                defaultValue: table.fields.find(field => field.name === names[spec.key] && spec.types.includes(field.type)),
            });
        }
        return definitions;
    };
}
