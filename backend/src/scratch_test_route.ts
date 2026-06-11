import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

import { supabase } from './lib/supabase.js';

async function test() {
  try {
    // Let's first query campaigns to find a valid campaign_id and owner_id
    const { data: camp, error: campErr } = await supabase.from('campaigns').select('id, owner_id').limit(1).single();
    if (campErr) {
      console.error("Campaign query error:", campErr);
      return;
    }
    console.log("Using campaign:", camp);
    
    const cId = camp.id;
    const rId = camp.owner_id || '00000000-0000-0000-0000-000000000000'; 
    
    console.log(`Querying tracking_links with campaign_id=${cId}, channel=whatsapp, recruiter_id=${rId}`);
    
    const { data: existing, error: existingError } = await supabase
      .from('tracking_links')
      .select('*')
      .eq('campaign_id', cId)
      .eq('channel', 'whatsapp')
      .eq('is_active', true)
      .or(`recruiter_id.eq.${rId},recruiter_id.is.null`);
      
    if (existingError) {
      console.error("Query error in .or():", existingError);
    } else {
      console.log("Query success! Found existing:", existing);
    }
  } catch (err) {
    console.error("Crash:", err);
  }
}

test();
