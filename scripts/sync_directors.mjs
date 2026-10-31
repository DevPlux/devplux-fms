import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Please provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectAndSyncDirectors() {
  console.log('--- Devplux Financial Management System: Director Status Inspector ---');

  // 1. Fetch all profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, must_change_password, is_active, updated_at')
    .order('email', { ascending: true });

  if (error) {
    console.error('Failed to query profiles:', error.message);
    process.exit(1);
  }

  const tableData = (profiles || []).map((p) => ({
    Name: p.full_name,
    Email: p.email,
    Role: p.role,
    'First-Login Setup': p.must_change_password ? 'SETUP REQUIRED' : 'ENACTED',
    Status: p.is_active ? 'ACTIVE' : 'INACTIVE',
    'Last Updated': p.updated_at || 'N/A',
  }));

  console.table(tableData);
}

inspectAndSyncDirectors().catch(console.error);

