import { createClient } from '@supabase/supabase-js';
import { config } from '../config/config';
import { Logger } from '../utils/logger';

// Initialize the Supabase client
const supabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Test the database connection
export async function testConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabaseClient.from('alarms').select('id').limit(1);
    if (error) {
      Logger.error('Failed to connect to Supabase', error);
      return false;
    }
    Logger.info('Successfully connected to Supabase');
    return true;
  } catch (error) {
    Logger.error('Error testing Supabase connection', error as Error);
    return false;
  }
}

export { supabaseClient }; 