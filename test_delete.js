const SUPABASE_URL = 'https://pzdzhpbleuacmwjzfizq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6ZHpocGJsZXVhY213anpmaXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MzYwNTAsImV4cCI6MjA4ODAxMjA1MH0.8sIkZmVb6EZw5WGOiDxfy2r1uG3ZK-0nDJAz7Bvvz5k';

async function t() {
    const r1 = await fetch(`${SUPABASE_URL}/rest/v1/crm_import_rows?select=row_uid&is_missing_in_latest_upload=eq.true`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } });
    const rows = await r1.json();
    console.log("Missing rows in import:", rows.length);

    // Let's do a join query (embed) to see how many missing rows have tracking items BEFORE we attempt delete
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/crm_tracking?select=row_uid,crm_import_rows!inner(row_uid)&crm_import_rows.is_missing_in_latest_upload=eq.true`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } });
    const tracks = await r2.json();
    console.log("Missing rows tracking objects:", tracks.length);
}
t();
