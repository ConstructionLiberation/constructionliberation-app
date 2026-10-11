// The weather source as it reads in the bracket after "Weather" on a Project
// Report (1070) - e.g. "Open-Meteo, Met Office UK model". A file of its own so
// the report page and the PDF can use it without loading the lookup code.
// Reports saved before 1070 stored 'Open-Meteo (Met Office UK model)'; both
// read the same.
export const sourceLabel = (w) => String((w && w.source) || 'Open-Meteo, Met Office UK model').replace(/\s*\((.*)\)\s*$/, ', $1')
