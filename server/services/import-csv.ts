import { ApiError } from '../http/errors.js';
export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 10000, maxColumns: 100 };
export interface CsvDocument {
    headers: string[];
    rows: {
        rowNumber: number;
        values: Record<string, string>;
    }[];
}
export function parseImportCsv(input: string): CsvDocument {
    if (Buffer.byteLength(input, 'utf8') > IMPORT_LIMITS.maxBytes)
        throw new ApiError(413, 'IMPORT_TOO_LARGE', 'CSV files must be at most 5 MiB.');
    const text = input.replace(/^\uFEFF/, '');
    if (text.includes('\0'))
        throw new ApiError(400, 'INVALID_CSV', 'Upload a UTF-8 CSV text file.');
    const records: {
        rowNumber: number;
        cells: string[];
    }[] = [];
    let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, start = 1;
    const finish = () => { cells.push(cell); if (cells.length > IMPORT_LIMITS.maxColumns)
        throw new ApiError(400, 'INVALID_CSV', 'CSV files support at most 100 columns.'); if (cells.some(c => c.trim() !== ''))
        records.push({ rowNumber: start, cells }); if (records.length > IMPORT_LIMITS.maxRows + 1)
        throw new ApiError(413, 'IMPORT_TOO_LARGE', 'CSV files support at most 10,000 data rows.'); cells = []; cell = ''; closed = false; };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else {
                cell += ch;
                if (ch === '\n')
                    line++;
                else if (ch === '\r' && text[i + 1] !== '\n')
                    line++;
            }
            continue;
        }
        if (ch === '"') {
            if (cell !== '' || closed)
                throw new ApiError(400, 'INVALID_CSV', 'A quote must begin a CSV field.');
            quoted = true;
            continue;
        }
        if (ch === ',') {
            cells.push(cell);
            cell = '';
            closed = false;
            continue;
        }
        if (ch === '\r' || ch === '\n') {
            finish();
            if (ch === '\r' && text[i + 1] === '\n')
                i++;
            line++;
            start = line;
            continue;
        }
        if (closed)
            throw new ApiError(400, 'INVALID_CSV', 'Only a delimiter or line ending may follow a quoted field.');
        cell += ch;
    }
    if (quoted)
        throw new ApiError(400, 'INVALID_CSV', 'Close every quoted CSV field.');
    if (cell !== '' || cells.length)
        finish();
    const header = records.shift();
    if (!header || !records.length)
        throw new ApiError(400, 'INVALID_CSV', 'Include a header and at least one data row.');
    const headers = header.cells.map(h => h.trim());
    if (headers.some(h => !h || h.length > 200) || new Set(headers).size !== headers.length)
        throw new ApiError(400, 'INVALID_CSV', 'Use unique, nonempty column headers of at most 200 characters.');
    return { headers, rows: records.map(r => { if (r.cells.length !== headers.length)
            throw new ApiError(400, 'INVALID_CSV', `Source row ${r.rowNumber} has a different column count from the header.`); return { rowNumber: r.rowNumber, values: Object.fromEntries(headers.map((h, i) => [h, r.cells[i] ?? ''])) }; }) };
}
export function safeCsvCell(value: string | number): string { let text = String(value); if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text))
    text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; }
