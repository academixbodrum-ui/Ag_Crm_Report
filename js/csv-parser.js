/**
 * csv-parser.js — CSV Parsing & Normalization for CRM Reports
 * Handles: delimiter ";", encoding "latin1", date/numeric parsing, row_uid, row_hash
 */

const CSV_COLUMNS = [
    'Name', 'Surname', 'E-Mail', 'Cell Phone',
    'School', 'School Center', 'Branch',
    'Employee', 'Processor', 'Program',
    'Record Date', 'Program Start Date', 'Duration',
    'Total Debt', 'Paid', 'Refund', 'Tuition',
    'Cancellation', 'Balance', 'Comm', 'Discount',
    'Currency', 'Represantative', 'Represantative Comm', 'School Balance'
];

const NUMERIC_FIELDS = [
    'Total Debt', 'Paid', 'Refund', 'Tuition',
    'Cancellation', 'Balance', 'Comm', 'Discount',
    'Represantative Comm', 'School Balance'
];

const DATE_FIELDS = ['Record Date', 'Program Start Date'];

const STATUSES = ['', 'Process', 'Awaiting Payment', 'School Payment', 'Commission', 'Commission (Taksim)', 'Completed', 'Cancelled'];

/**
 * Read a file as text with Latin-1 encoding
 */
function readFileAsLatin1(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, 'iso-8859-1');
    });
}

/**
 * Parse CSV text with ";" delimiter
 */
function parseCSVText(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

        const row = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j].trim()] = j < values.length ? values[j] : '';
        }
        rows.push(row);
    }

    return { headers: headers.map(h => h.trim()), rows };
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ';') {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Parse date string in dd.MM.yyyy HH:mm format
 * Returns ISO string or null
 */
function parseDateField(value) {
    if (!value || value.trim() === '') return null;

    const val = value.trim();

    // Try dd.MM.yyyy HH:mm or dd.MM.yyyy HH:mm:ss (with . / - separators)
    const match1 = val.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (match1) {
        const [, day, month, year, hour, minute, second] = match1;
        const d = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour || 0),
            parseInt(minute || 0),
            parseInt(second || 0)
        );
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Try dd.MM.yyyy (no time)
    const match2 = val.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
    if (match2) {
        const [, day, month, year] = match2;
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Try yyyy-MM-dd or ISO format
    const match3 = val.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (match3) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Last resort: native Date parsing
    const lastTry = new Date(val);
    if (!isNaN(lastTry.getTime())) return lastTry.toISOString();

    return null; // parse error
}

/**
 * Parse numeric field: replace comma with dot, return float or null
 */
function parseNumericField(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (str === '' || str === '-') return null;

    // Replace comma decimal separator
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

/**
 * Format date ISO string to dd.MM.yyyy for display
 */
function formatDateDisplay(dateInput) {
    if (!dateInput) return '';
    try {
        const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return '';

        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}.${mm}.${yy}`;
    } catch (e) {
        return '';
    }
}

/**
 * Format number for display
 */
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '';
    if (parseFloat(num) === 0) return '';
    return num.toLocaleString('tr-TR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Generate base row_uid from a parsed row (Name + Surname + Record Date)
 */
function generateRowUID(row) {
    const name = (row['Name'] || '').trim().toLowerCase();
    const surname = (row['Surname'] || '').trim().toLowerCase();
    const recordDate = row['Record Date'] || '';
    const recordDateStr = recordDate ? formatDateDisplay(recordDate) : '';

    return `${name}|${surname}|${recordDateStr}`;
}

/**
 * Generate a SHA-1 hash of the row content for change detection
 */
async function generateRowHash(row) {
    const content = CSV_COLUMNS.map(col => String(row[col] || '')).join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate UUID v4
 */
function generateUUID() {
    return crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
}

/**
 * Normalize a raw CSV row → import row with all fields properly typed
 */
function normalizeRow(rawRow) {
    const row = {};
    const parseErrors = [];

    // Text fields
    row['Name'] = (rawRow['Name'] || '').trim() || null;
    row['Surname'] = (rawRow['Surname'] || '').trim() || null;
    row['E-Mail'] = (rawRow['E-Mail'] || '').trim() || null;
    row['Cell Phone'] = (rawRow['Cell Phone'] || '').trim() || null;
    row['School'] = (rawRow['School'] || '').trim() || null;
    row['School Center'] = (rawRow['School Center'] || '').trim() || null;
    row['Branch'] = (rawRow['Branch'] || '').trim() || null;
    row['Employee'] = (rawRow['Employee'] || '').trim() || null;
    row['Processor'] = (rawRow['Processor'] || '').trim() || null;
    row['Program'] = (rawRow['Program'] || '').trim() || null;
    row['Duration'] = (rawRow['Duration'] || '').trim() || null;
    row['Currency'] = (rawRow['Currency'] || '').trim() || null;
    row['Represantative'] = (rawRow['Represantative'] || '').trim() || null;

    // Date fields
    for (const field of DATE_FIELDS) {
        const rawVal = rawRow[field];
        // Debug: log raw date for first row
        if (rawRow === arguments[0] || !window._dateDebugDone) {
            if (!window._dateDebugDone) {
                console.log(`DATE DEBUG - Raw "${field}":`, JSON.stringify(rawVal),
                    'length:', rawVal ? rawVal.length : 0,
                    'charCodes:', rawVal ? Array.from(rawVal.substring(0, 30)).map(c => c.charCodeAt(0)) : 'N/A');
                if (field === 'Program Start Date') window._dateDebugDone = true;
            }
        }
        const parsed = parseDateField(rawVal);
        if (rawVal && rawVal.trim() !== '' && parsed === null) {
            parseErrors.push(`date:${field}`);
        }
        row[field] = parsed;
    }

    // Numeric fields
    for (const field of NUMERIC_FIELDS) {
        const parsed = parseNumericField(rawRow[field]);
        if (rawRow[field] && rawRow[field].trim() !== '' && rawRow[field].trim() !== '-' && parsed === null) {
            parseErrors.push(`numeric:${field}`);
        }
        row[field] = parsed;
    }

    row._parse_errors = parseErrors.length > 0 ? parseErrors : null;

    return row;
}

/**
 * Full pipeline: parse CSV file → normalized rows with row_uid and row_hash
 */
async function processCSVFile(file, onProgress) {
    if (onProgress) onProgress(5, 'Dosya okunuyor...');

    const text = await readFileAsLatin1(file);
    if (onProgress) onProgress(15, 'CSV parse ediliyor...');

    const { headers, rows: rawRows } = parseCSVText(text);

    if (rawRows.length === 0) {
        throw new Error('CSV dosyası boş veya geçersiz.');
    }

    if (onProgress) onProgress(25, `${rawRows.length} satır bulundu. Normalize ediliyor...`);

    const uploadId = generateUUID();
    const uploadedAt = new Date().toISOString();
    const processedRows = [];

    // Track UID occurrences to guarantee uniqueness
    const uidCounts = {};

    for (let i = 0; i < rawRows.length; i++) {
        const normalized = normalizeRow(rawRows[i]);
        let baseUid = generateRowUID(normalized);

        // Increment counter for this base UID (Name + Surname + Record Date)
        if (uidCounts[baseUid] === undefined) {
            uidCounts[baseUid] = 1;
        } else {
            uidCounts[baseUid]++;
        }

        // Append 4-digit counter to ensure uniqueness (e.g., 0001, 0002)
        const counterStr = String(uidCounts[baseUid]).padStart(4, '0');
        const uid = `${baseUid}|${counterStr}`;

        normalized.row_uid = uid;
        normalized.row_hash = await generateRowHash(normalized);
        normalized.source_upload_id = uploadId;
        normalized.source_uploaded_at = uploadedAt;
        normalized.is_missing_in_latest_upload = false;
        normalized.archived_at = null;

        processedRows.push(normalized);

        if (i % 100 === 0 && onProgress) {
            const pct = 25 + Math.floor((i / rawRows.length) * 50);
            onProgress(pct, `Satır ${i + 1}/${rawRows.length} işleniyor...`);
        }
    }

    if (onProgress) onProgress(80, 'İşlem tamamlandı.');

    // Log UID uniqueness stats
    const uniqueUIDs = new Set(processedRows.map(r => r.row_uid));
    console.log(`Processed: ${processedRows.length} rows, ${uniqueUIDs.size} unique UIDs`);

    return {
        uploadId,
        uploadedAt,
        headers,
        totalRows: rawRows.length,
        processedRows,
        fileName: file.name
    };
}
