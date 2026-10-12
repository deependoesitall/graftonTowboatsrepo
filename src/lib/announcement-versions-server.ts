// Server side of announcement versions: which one is selected, and the
// rendered email for a version key ('branded', 'plain', or a custom id).
import { createServiceClient } from '@/lib/supabase/server';
import {
  type AnnouncementEmail, type CustomVersion,
  buildBrandedAnnouncement, buildPlainAnnouncement, renderCustomVersion,
} from '@/lib/announcement-versions';

type Supa = ReturnType<typeof createServiceClient>;

export const BUILT_IN = [
  { key: 'branded', name: 'Branded' },
  { key: 'plain', name: 'Plain' },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function selectedVersionKey(supabase: Supa): Promise<string> {
  const { data } = await supabase.from('admin_settings').select('announcement_version').single();
  return (data?.announcement_version as string | undefined) || 'branded';
}

export async function listCustomVersions(supabase: Supa): Promise<CustomVersion[]> {
  const { data, error } = await supabase.from('email_announcement_versions')
    .select('id, name, subject, body, format').eq('archived', false).order('created_at');
  if (error) throw new Error(error.message);
  return (data || []) as CustomVersion[];
}

/** The email for `key`. An unknown or archived custom id falls back to Branded
 *  so a queue never stalls on a deleted version. */
export async function loadAnnouncement(supabase: Supa, key?: string | null): Promise<AnnouncementEmail & { key: string }> {
  const k = key || await selectedVersionKey(supabase);
  if (k === 'plain') return { key: k, ...buildPlainAnnouncement() };
  if (UUID.test(k)) {
    const { data } = await supabase.from('email_announcement_versions')
      .select('subject, body, format').eq('id', k).eq('archived', false).maybeSingle();
    if (data) return { key: k, ...renderCustomVersion(data as CustomVersion) };
  }
  return { key: 'branded', ...buildBrandedAnnouncement() };
}
