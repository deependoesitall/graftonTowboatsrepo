// src/lib/list-email.ts
// The one message a list send puts in one inbox. The queue, "Send me one
// first" and the Send tab's test all build it here, so a test is exactly
// what a reader gets, unsubscribe link and headers included.
import { withUnsubscribe, type AnnouncementEmail } from '@/lib/announcement-versions';
import { unsubscribeHeaders, unsubscribeUrl } from '@/lib/unsubscribe';

export type ListMessage = AnnouncementEmail & { headers: Record<string, string>; tags: { name: string; value: string }[] };

const tagValue = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);

export function listMessage(email: AnnouncementEmail, to: string, ids: { key: string; importId?: string | null }): ListMessage {
  const url = unsubscribeUrl(to);
  const { subject, html, text } = withUnsubscribe(email, url);
  // Tags come back on Resend's webhook events, so opens and clicks can be
  // counted per newsletter and per send.
  const tags = [{ name: 'newsletter', value: tagValue(ids.key) }];
  if (ids.importId) tags.push({ name: 'import', value: tagValue(ids.importId) });
  return { subject, html, text, headers: unsubscribeHeaders(url), tags };
}
