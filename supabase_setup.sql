-- ==========================================
-- CRM Report System - Supabase Table Setup
-- ==========================================

-- 1. crm_import_rows - Raw CSV data (source copy)
CREATE TABLE IF NOT EXISTS crm_import_rows (
    row_uid TEXT PRIMARY KEY,
    row_hash TEXT,
    source_upload_id TEXT,
    source_uploaded_at TIMESTAMPTZ,
    is_missing_in_latest_upload BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    name TEXT,
    surname TEXT,
    email TEXT,
    cell_phone TEXT,
    school TEXT,
    school_center TEXT,
    branch TEXT,
    employee TEXT,
    processor TEXT,
    program TEXT,
    record_date TIMESTAMPTZ,
    program_start_date TIMESTAMPTZ,
    duration TEXT,
    total_debt NUMERIC,
    paid NUMERIC,
    refund NUMERIC,
    tuition NUMERIC,
    cancellation NUMERIC,
    balance NUMERIC,
    comm NUMERIC,
    discount NUMERIC,
    currency TEXT,
    represantative TEXT,
    represantative_comm NUMERIC,
    school_balance NUMERIC,
    parse_errors TEXT[]
);

-- 2. crm_tracking - User tracking data (never overwritten by CSV upload)
CREATE TABLE IF NOT EXISTS crm_tracking (
    row_uid TEXT PRIMARY KEY,
    status TEXT DEFAULT 'New',
    status_reason TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    next_follow_up_date DATE,
    owner TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    last_touched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. upload_history - Track each CSV upload
CREATE TABLE IF NOT EXISTS upload_history (
    upload_id TEXT PRIMARY KEY,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    file_name TEXT,
    total_rows INTEGER DEFAULT 0,
    inserted INTEGER DEFAULT 0,
    updated INTEGER DEFAULT 0,
    unchanged INTEGER DEFAULT 0,
    missing_marked INTEGER DEFAULT 0,
    parse_errors INTEGER DEFAULT 0
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_import_school ON crm_import_rows(school);
CREATE INDEX IF NOT EXISTS idx_import_branch ON crm_import_rows(branch);
CREATE INDEX IF NOT EXISTS idx_import_employee ON crm_import_rows(employee);
CREATE INDEX IF NOT EXISTS idx_import_program ON crm_import_rows(program);
CREATE INDEX IF NOT EXISTS idx_import_currency ON crm_import_rows(currency);
CREATE INDEX IF NOT EXISTS idx_import_missing ON crm_import_rows(is_missing_in_latest_upload);
CREATE INDEX IF NOT EXISTS idx_tracking_status ON crm_tracking(status);

-- Enable Row Level Security (allow all for anon for this app)
ALTER TABLE crm_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_history ENABLE ROW LEVEL SECURITY;

-- Policies: Allow full access for anon role
CREATE POLICY "Allow all for anon" ON crm_import_rows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON crm_tracking FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON upload_history FOR ALL USING (true) WITH CHECK (true);

-- 4. program_types - Program type classification  
CREATE TABLE IF NOT EXISTS program_types (
    program_name TEXT PRIMARY KEY,
    program_type TEXT DEFAULT 'Diğer' CHECK (program_type IN ('Akademik', 'Dil', 'Diğer'))
);

ALTER TABLE program_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON program_types FOR ALL USING (true) WITH CHECK (true);

-- 5. status_rules - Rules for fields based on status
CREATE TABLE IF NOT EXISTS status_rules (
    status TEXT PRIMARY KEY,
    rules JSONB DEFAULT '{}'
);

ALTER TABLE status_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON status_rules FOR ALL USING (true) WITH CHECK (true);

-- 6. visual_rules - Conditional formatting rules for rows
CREATE TABLE IF NOT EXISTS visual_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_cond TEXT,
    field_cond TEXT,
    operator_cond TEXT,
    value_cond TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE visual_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON visual_rules FOR ALL USING (true) WITH CHECK (true);
