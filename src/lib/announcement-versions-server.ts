// Server side of list emails: the newsletters table, which copy the
// announcement uses, and the rendered email for a send.
//
// Keys: 'announcement' (whatever is picked for it), 'branded' and 'plain'
// (the built-in announcement copies), or a newsletter id.
import { createServiceClient } from '@/lib/supabase/server';
import {
  type AnnouncementEmail, type Newsletter,
  buildBrandedAnnouncement, buildPlainAnnouncement, renderNewsletter,
} from '@/lib/announcement-versions';
import { renderBlocks } from '@/lib/email-render';
import { isDoc } from '@/lib/email-blocks';

type Supa = ReturnType<typeof createServiceClient>;

export const BUILT_IN = [
  { key: 'branded', name: 'Branded' },
  { key: 'plain', name: 'Plain' },
] as const;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function selectedVersionKey(supabase: Supa): Promise<string> {
  const { data } = await supabase.from('admin_settings').select('announcement_version').single();
  return (data?.announcement_version as string | undefined) || 'branded';
}

export async function listNewsletters(supabase: Supa): Promise<(Newsletter & { updated_at: string; created_by_name: string | null })[]> {
  const { data, error } = await supabase.from('newsletters')
    .select('id, name, subject, body, style, format, send_plain, updated_at, created_by_name')
    .eq('archived', false).order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as (Newsletter & { updated_at: string; created_by_name: string | null })[];
}

/** The email for `key`. An unknown or deleted newsletter falls back to the
 *  Branded announcement for the announcement, so its queue never stalls;
 *  for a newsletter send it throws, and the send stops with that error. */
export async function loadAnnouncement(supabase: Supa, key?: string | null): Promise<AnnouncementEmail & { key: string }> {
  const asAnnouncement = !key || key === 'announcement';
  const k = asAnnouncement ? await selectedVersionKey(supabase) : key;
  if (k === 'plain') return { key: k, ...buildPlainAnnouncement() };
  if (k === 'branded') return { key: k, ...buildBrandedAnnouncement() };
  if (UUID.test(k)) {
    const { data } = await supabase.from('newsletters')
      .select('subject, body, style, format, blocks, send_plain').eq('id', k).eq('archived', false).maybeSingle();
    const n = data as Newsletter | null;
    if (n?.format === 'blocks' && isDoc(n.blocks)) return { key: k, ...await renderBlocks(n.blocks, { subject: n.subject, plain: n.send_plain }) };
    if (n) return { key: k, ...renderNewsletter(n) };
  }
  if (!asAnnouncement) throw new Error('That newsletter was deleted');
  return { key: 'branded', ...buildBrandedAnnouncement() };
}
