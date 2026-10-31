import { createClient } from '@supabase/supabase-js';

// Reads existing environment variables automatically if passed or when executed
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Please provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setAllDirectorsToDirector() {
  console.log('Updating all profiles to role: "director"...');

  const { data, error } = await supabase
    .from('profiles')
    .update({ role: 'director' })
    .neq('role', 'none')
    .select('id, full_name, email, role');

  if (error) {
    console.error('Error updating profiles:', error.message);
  } else {
    console.log('Successfully updated directors to role "director":');
    console.table(data);
  }
}

setAllDirectorsToDirector();

