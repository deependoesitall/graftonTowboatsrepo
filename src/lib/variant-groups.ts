// src/lib/variant-groups.ts
//
// Collapse the barge form's repeated cuts (2 pk / 4 pk / 8 pk, 3# / 5#) into
// one storefront card with a size chooser. The SQL lives in
// rebuild_variant_groups() — this is the one Node call site so catalog
// imports, form-layout stamps, and the nightly sync all re-label after they
// rewrite product rows. New barge rows land with variant_group NULL.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function rebuildVariantGroups(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('rebuild_variant_groups');
  if (error) {
    console.error('rebuild_variant_groups:', error.message);
    return 0;
  }
  return Number(data) || 0;
}
