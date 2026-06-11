import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

import { supabase } from './lib/supabase.js';

async function test() {
  try {
    const { data: camp, error: campErr } = await supabase.from('campaigns').select('id, owner_id').limit(1).single();
    if (campErr) {
      console.error("Campaign query error:", campErr);
      return;
    }
    console.log("Using campaign:", camp);
    
    // Let's find a valid user ID from auth.users (if any) or use camp.owner_id
    // Wait, let's query profiles or another table that might reference auth.users to see a valid user id.
    // Or we can just try to insert a tracking link with recruiter_id set to null, and with a real user ID.
    const cId = camp.id;
    
    // First query auth.users if we can, or just try to insert with recruiter_id = null
    console.log("Testing insert with recruiter_id = null...");
    const { data: newLink1, error: err1 } = await supabase
      .from('tracking_links')
      .insert({
        campaign_id: cId,
        channel: 'linkedin',
        recruiter_id: null,
        utm_source: 'li',
        utm_medium: 'social',
        utm_campaign: 'test',
        is_active: true,
        total_clicks: 0
      })
      .select('*')
      .maybeSingle();

    if (err1) {
      console.error("Insert with null recruiter_id failed:", err1);
    } else {
      console.log("Insert with null recruiter_id succeeded:", newLink1);
    }

    // Now let's try with the owner_id if it exists
    if (camp.owner_id) {
      console.log(`Testing insert with recruiter_id = ${camp.owner_id}...`);
      const { data: newLink2, error: err2 } = await supabase
        .from('tracking_links')
        .insert({
          campaign_id: cId,
          channel: 'facebook',
          recruiter_id: camp.owner_id,
          utm_source: 'fb',
          utm_medium: 'social',
          utm_campaign: 'test',
          is_active: true,
          total_clicks: 0
        })
        .select('*')
        .maybeSingle();

      if (err2) {
        console.error("Insert with owner_id failed:", err2);
      } else {
        console.log("Insert with owner_id succeeded:", newLink2);
      }
    }
  } catch (err) {
    console.error("Crash:", err);
  }
}

test();
