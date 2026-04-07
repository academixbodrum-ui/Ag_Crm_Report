/**
 * db.js — Supabase Data Layer for CRM Tracker
 * Tables: crm_import_rows, crm_tracking, upload_history
 */

const SUPABASE_URL = 'https://pzdzhpbleuacmwjzfizq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6ZHpocGJsZXVhY213anpmaXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MzYwNTAsImV4cCI6MjA4ODAxMjA1MH0.8sIkZmVb6EZw5WGOiDxfy2r1uG3ZK-0nDJAz7Bvvz5k';

// ========== Lightweight Supabase REST Client ==========

class SupabaseClient {
    constructor(url, key) {
        this.url = url;
        this.key = key;
        this.restUrl = `${url}/rest/v1`;
        this.headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    }

    async _fetch(endpoint, options = {}) {
        const res = await fetch(`${this.restUrl}${endpoint}`, {
            ...options,
            headers: { ...this.headers, ...(options.headers || {}) }
        });
        if (!res.ok) {
            const errBody = await res.text();
            console.error('Supabase error:', res.status, errBody);
            throw new Error(`Supabase error ${res.status}: ${errBody}`);
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }

    // SELECT
    async select(table, query = '') {
        // Enforce a high limit if not specified to avoid PosgREST default 1000 limit
        const limitQuery = query.includes('limit=') ? '' : (query ? '&limit=10000' : 'limit=10000');
        return this._fetch(`/${table}?${query}${limitQuery}`, { method: 'GET' });
    }

    // SELECT single
    async selectOne(table, query = '') {
        const res = await fetch(`${this.restUrl}/${table}?${query}`, {
            method: 'GET',
            headers: { ...this.headers, 'Accept': 'application/vnd.pgrst.object+json' }
        });
        if (res.status === 406) return null; // Not found
        if (!res.ok) {
            // If 406 or similar, return null
            return null;
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }

    // UPSERT (INSERT with ON CONFLICT)
    async upsert(table, data, onConflict = '') {
        const conflictParam = onConflict ? `?on_conflict=${onConflict}` : '';
        return this._fetch(`/${table}${conflictParam}`, {
            method: 'POST',
            headers: { ...this.headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
            body: JSON.stringify(Array.isArray(data) ? data : [data])
        });
    }

    // INSERT
    async insert(table, data) {
        return this._fetch(`/${table}`, {
            method: 'POST',
            body: JSON.stringify(Array.isArray(data) ? data : [data])
        });
    }

    // UPDATE with filter
    async update(table, data, filter) {
        return this._fetch(`/${table}?${filter}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    // DELETE with filter
    async delete(table, filter) {
        return this._fetch(`/${table}?${filter}`, { method: 'DELETE' });
    }

    // COUNT
    async count(table, filter = '') {
        const res = await fetch(`${this.restUrl}/${table}?select=count&${filter}`, {
            method: 'HEAD',
            headers: { ...this.headers, 'Prefer': 'count=exact' }
        });
        const range = res.headers.get('content-range');
        if (range) {
            const total = range.split('/')[1];
            return parseInt(total) || 0;
        }
        return 0;
    }
}

const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== Field mapping: JS (CSV column names) <-> DB (snake_case) ==========

const FIELD_MAP_TO_DB = {
    'Name': 'name',
    'Surname': 'surname',
    'E-Mail': 'email',
    'Cell Phone': 'cell_phone',
    'School': 'school',
    'School Center': 'school_center',
    'Branch': 'branch',
    'Employee': 'employee',
    'Processor': 'processor',
    'Program': 'program',
    'Record Date': 'record_date',
    'Program Start Date': 'program_start_date',
    'Duration': 'duration',
    'Total Debt': 'total_debt',
    'Paid': 'paid',
    'Refund': 'refund',
    'Tuition': 'tuition',
    'Cancellation': 'cancellation',
    'Balance': 'balance',
    'Comm': 'comm',
    'Discount': 'discount',
    'Currency': 'currency',
    'Represantative': 'represantative',
    'Represantative Comm': 'represantative_comm',
    'School Balance': 'school_balance'
};

const FIELD_MAP_TO_JS = {};
for (const [js, db] of Object.entries(FIELD_MAP_TO_DB)) {
    FIELD_MAP_TO_JS[db] = js;
}

function toDbRow(jsRow) {
    const dbRow = {};
    for (const [jsKey, dbKey] of Object.entries(FIELD_MAP_TO_DB)) {
        if (jsRow[jsKey] !== undefined) {
            dbRow[dbKey] = jsRow[jsKey];
        }
    }
    // System fields
    if (jsRow.row_uid !== undefined) dbRow.row_uid = jsRow.row_uid;
    if (jsRow.row_hash !== undefined) dbRow.row_hash = jsRow.row_hash;
    if (jsRow.source_upload_id !== undefined) dbRow.source_upload_id = jsRow.source_upload_id;
    if (jsRow.source_uploaded_at !== undefined) dbRow.source_uploaded_at = jsRow.source_uploaded_at;
    if (jsRow.is_missing_in_latest_upload !== undefined) dbRow.is_missing_in_latest_upload = jsRow.is_missing_in_latest_upload;
    if (jsRow.archived_at !== undefined) dbRow.archived_at = jsRow.archived_at;
    if (jsRow.previous_values !== undefined) dbRow.previous_values = jsRow.previous_values;
    if (jsRow._parse_errors) dbRow.parse_errors = jsRow._parse_errors;
    return dbRow;
}

function toJsRow(dbRow) {
    const jsRow = {};
    for (const [dbKey, jsKey] of Object.entries(FIELD_MAP_TO_JS)) {
        if (dbRow[dbKey] !== undefined) {
            jsRow[jsKey] = dbRow[dbKey];
        }
        // Also keep raw DB key so data is always accessible
        if (dbRow[dbKey] !== undefined) {
            jsRow[dbKey] = dbRow[dbKey];
        }
    }
    // System fields
    jsRow.row_uid = dbRow.row_uid;
    jsRow.row_hash = dbRow.row_hash;
    jsRow.source_upload_id = dbRow.source_upload_id;
    jsRow.source_uploaded_at = dbRow.source_uploaded_at;
    jsRow.is_missing_in_latest_upload = dbRow.is_missing_in_latest_upload || false;
    jsRow.archived_at = dbRow.archived_at;
    jsRow.previous_values = dbRow.previous_values || null;
    jsRow._parse_errors = dbRow.parse_errors;
    return jsRow;
}

// ========== CRM Database API ==========

class CrmDatabase {
    constructor() {
        this.ready = false;
        this.supabase = supabase;
    }

    async open() {
        // Test connection by doing a simple select
        try {
            await supabase.select('upload_history', 'select=upload_id&limit=1');
            this.ready = true;
            console.log('Supabase connection successful');
        } catch (e) {
            console.error('Supabase connection test failed:', e);
            throw new Error('Supabase bağlantısı başarısız. Tabloların oluşturulduğundan emin olun.');
        }
    }

    // ========== IMPORT ROWS ==========

    async getImportRow(row_uid) {
        try {
            const result = await supabase.selectOne('crm_import_rows', `row_uid=eq.${encodeURIComponent(row_uid)}`);
            return result ? toJsRow(result) : null;
        } catch {
            return null;
        }
    }

    async getAllImportRows() {
        // Enforce maximum limit to avoid partial data
        const results = await supabase.select('crm_import_rows', 'order=name.asc.nullslast&limit=10000');
        console.log(`DEBUG DB - Toplam ${results.length} satır çekildi.`);
        return results.map(toJsRow);
    }

    async getAllTracking() {
        return await supabase.select('crm_tracking', 'order=created_at.desc.nullslast&limit=10000');
    }

    async putImportRow(row) {
        const dbRow = toDbRow(row);
        await supabase.upsert('crm_import_rows', dbRow, 'row_uid');
    }

    async putImportRows(rows) {
        // Batch in chunks of 500
        const dbRows = rows.map(toDbRow);
        const chunkSize = 500;
        for (let i = 0; i < dbRows.length; i += chunkSize) {
            const chunk = dbRows.slice(i, i + chunkSize);
            await supabase.upsert('crm_import_rows', chunk, 'row_uid');
        }
    }

    async markAllAsMissing() {
        await supabase.update('crm_import_rows',
            { is_missing_in_latest_upload: true },
            'is_missing_in_latest_upload=neq.true'  // Only update those not already missing
        );
    }

    async unmarkMissing(row_uid) {
        await supabase.update('crm_import_rows',
            { is_missing_in_latest_upload: false, archived_at: null },
            `row_uid=eq.${encodeURIComponent(row_uid)}`
        );
    }

    // ========== TRACKING ==========

    async getTracking(row_uid) {
        try {
            const result = await supabase.selectOne('crm_tracking', `row_uid=eq.${encodeURIComponent(row_uid)}`);
            return result || null;
        } catch {
            return null;
        }
    }

    async getAllTracking() {
        return await supabase.select('crm_tracking', 'order=created_at.desc.nullslast');
    }

    async putTracking(tracking) {
        tracking.last_touched_at = new Date().toISOString();
        await supabase.upsert('crm_tracking', tracking, 'row_uid');
    }

    async createTrackingIfNotExists(row_uid) {
        const existing = await this.getTracking(row_uid);
        if (!existing) {
            const tracking = {
                row_uid,
                status: 'Process',
                status_reason: '',
                notes: '',
                next_follow_up_date: null,
                owner: '',
                tags: [],
                last_touched_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            try {
                await supabase.insert('crm_tracking', tracking);
            } catch (e) {
                // Might already exist due to race condition
                console.warn('Tracking insert failed (may already exist):', e.message);
            }
            return tracking;
        }
        return existing;
    }

    // ========== UPLOAD HISTORY ==========

    async addUploadHistory(entry) {
        await supabase.upsert('upload_history', entry, 'upload_id');
    }

    async getUploadHistory() {
        return await supabase.select('upload_history', 'order=uploaded_at.desc');
    }

    // ========== COMBINED QUERIES ==========

    async getJoinedData() {
        // Fetch both tables and join in JS
        const [imports, trackings] = await Promise.all([
            this.getAllImportRows(),
            this.getAllTracking()
        ]);

        const trackingMap = {};
        for (const t of trackings) {
            trackingMap[t.row_uid] = t;
        }

        return imports.map(row => ({
            ...row,
            _tracking: trackingMap[row.row_uid] || {
                status: 'Process',
                status_reason: '',
                notes: '',
                next_follow_up_date: null,
                owner: '',
                tags: [],
                last_touched_at: null,
                created_at: null
            }
        }));
    }

    async getActiveJoinedData() {
        const all = await this.getJoinedData();
        return all.filter(r => !r.is_missing_in_latest_upload);
    }

    async getDistinctValues(storeName, field) {
        // Map field name for import rows
        const table = storeName === 'crm_import_rows' ? 'crm_import_rows' : storeName;
        const dbField = FIELD_MAP_TO_DB[field] || field;

        const results = await supabase.select(table, `select=${dbField}&${dbField}=not.is.null&${dbField}=neq.&order=${dbField}.asc`);
        const values = new Set();
        for (const item of results) {
            const val = item[dbField];
            if (val !== null && val !== undefined && val !== '') {
                values.add(val);
            }
        }
        return Array.from(values).sort();
    }

    async getRowCount() {
        return await supabase.count('crm_import_rows');
    }
}

// Singleton
const crmDB = new CrmDatabase();
