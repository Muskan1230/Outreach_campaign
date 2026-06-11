import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

import { supabase } from './lib/supabase.js';

async function test() {
  try {
    // Get a campaign to test with
    const { data: camp } = await supabase.from('campaigns').select('id').limit(1).single();
    console.log("Test campaign:", camp);
    
    const campaignId = camp!.id;
    
    // Test insert (what the route does)
    console.log("\nInserting tracking link...");
    const { data: newLink, error: insertError } = await supabase
      .from('tracking_links')
      .insert({
        campaign_id: campaignId,
        channel: 'whatsapp',
        recruiter_id: null,
        utm_source: 'wa',
        utm_medium: 'social',
        utm_campaign: 'test',
        is_active: true,
        total_clicks: 0,
      })
      .select('*')
      .single();
      
    if (insertError) {
      console.error("Insert error:", insertError);
    } else {
      console.log("Insert success:", newLink);
      
      // Test click counter RPC
      console.log("\nTesting click counter...");
      const { error: rpcErr } = await supabase.rpc('increment_tracking_link_clicks', { p_link_id: newLink.id });
      if (rpcErr) {
        console.error("RPC error:", rpcErr);
      } else {
        console.log("Click incremented!");
        
        // Read back to verify
        const { data: updated } = await supabase.from('tracking_links').select('id, total_clicks, click_count').eq('id', newLink.id).single();
        console.log("After click:", updated);
      }
      
      // Cleanup — deactivate
      await supabase.from('tracking_links').delete().eq('id', newLink.id);
      console.log("\nCleanup done. All good! ✓");
    }
  } catch (err) {
    console.error("Crash:", err);
  }
}

test();
