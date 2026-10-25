// src/lib/send-plan.ts
// Calculates the day-by-day delivery rollout for scheduled and queued sends
// under Resend's daily sending limit (100 emails/day on the free plan; ~95/day
// for list batches so order confirmations and test emails always have room).
// Works in both the browser and the server.

export const PLAN_TZ = 'America/Chicago';
export const DEFAULT_DAILY_LIMIT = 100;
export const DEFAULT_DAILY_BATCH_CAP = 95;
export const DEFAULT_QUEUE_SEND_TIME = '08:30';

export type PlanScheduleInput = {
  id: string;
  newsletter_key: string;
  name: string;
  next_at: string | null;
  paused: boolean;
  recipientCount: number;
};

export type PlanQueuedInput = {
  id: string;
  name: string;
  created_at: string;
  pending: number;
};

export type PlanBatch = {
  day: string;          // YYYY-MM-DD in America/Chicago
  dayLabel: string;     // e.g. "Mon, Oct 26"
  weekdayLabel: string; // e.g. "Monday"
  time: string;         // HH:MM in America/Chicago
  timeLabel: string;    // e.g. "10:00 AM CT"
  count: number;
  isCarryover: boolean; // false = initial scheduled send, true = morning queue batch
};

export type SchedulePlan = {
  id: string;
  newsletter_key: string;
  name: string;
  recipientCount: number;
  startDay: string;
  startTime: string;
  startTimeLabel: string;
  batches: PlanBatch[];
  summary: string;
  overlapNotice: string | null;
  priorCarryoverCount: number;
  priorCarryoverFrom: string | null;
  suggestedMoveDate: string | null;
  suggestedMoveTime: string;
  suggestedMoveLabel: string | null;
};

function parts(d: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: PLAN_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

export function planCtDay(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const p = parts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function planCtHm(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const p = parts(d);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function planAddDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function planTimeLabel(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} CT`;
}

function noonUtcForDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 18, 0, 0));
}

export function planDayLabel(day: string): string {
  return noonUtcForDay(day).toLocaleDateString('en-US', {
    timeZone: PLAN_TZ, weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function planWeekdayLabel(day: string): string {
  return noonUtcForDay(day).toLocaleDateString('en-US', {
    timeZone: PLAN_TZ, weekday: 'long',
  });
}

/** Format a single-send rollout when sending `recipientCount` contacts starting on `startDay` at `startTime`. */
export function describeSingleRollout(opts: {
  recipientCount: number;
  startDay: string;
  startTime: string;
  queueSendTime?: string | null;
  dailyCap?: number;
  dailyLimit?: number;
  isImmediate?: boolean;
}): { batches: PlanBatch[]; summary: string } {
  const count = Math.max(0, opts.recipientCount);
  const cap = Math.max(1, opts.dailyCap ?? DEFAULT_DAILY_BATCH_CAP);
  const limit = opts.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  const qTime = opts.queueSendTime || DEFAULT_QUEUE_SEND_TIME;
  const batches: PlanBatch[] = [];
  if (count === 0) return { batches, summary: 'No subscribed contacts match this selection.' };

  const first = Math.min(cap, count);
  batches.push({
    day: opts.startDay,
    dayLabel: planDayLabel(opts.startDay),
    weekdayLabel: planWeekdayLabel(opts.startDay),
    time: opts.startTime,
    timeLabel: opts.isImmediate ? 'right now' : planTimeLabel(opts.startTime),
    count: first,
    isCarryover: false,
  });

  let rem = count - first;
  let curDay = opts.startDay;
  while (rem > 0) {
    curDay = planAddDays(curDay, 1);
    const take = Math.min(cap, rem);
    rem -= take;
    batches.push({
      day: curDay,
      dayLabel: planDayLabel(curDay),
      weekdayLabel: planWeekdayLabel(curDay),
      time: qTime,
      timeLabel: planTimeLabel(qTime),
      count: take,
      isCarryover: true,
    });
  }

  if (batches.length === 1) {
    const b0 = batches[0];
    return {
      batches,
      summary: opts.isImmediate
        ? `Sending to ${count} subscribed contacts: all ${count} go out right now.`
        : `Sending to ${count} subscribed contacts on ${b0.dayLabel} at ${b0.timeLabel}.`,
    };
  }
  if (batches.length === 2) {
    const [b0, b1] = batches;
    const firstWhen = opts.isImmediate ? 'right now' : `${b0.weekdayLabel} (${b0.dayLabel}) at ${b0.timeLabel}`;
    return {
      batches,
      summary: `Sending to ${count} subscribed contacts: ~${b0.count} go out ${firstWhen}, and the remaining ~${b1.count} finish automatically ${b1.weekdayLabel} (${b1.dayLabel}) at ${b1.timeLabel} (daily ${limit}-email limit).`,
    };
  }
  const partsText = batches.map((b, i) => {
    const w = i === 0 && opts.isImmediate ? 'right now' : `${b.dayLabel} at ${b.timeLabel}`;
    return i === batches.length - 1 ? `and the remaining ~${b.count} on ${w}` : `~${b.count} on ${w}`;
  }).join(', ');
  return {
    batches,
    summary: `Sending to ${count} subscribed contacts across ${batches.length} daily batches (daily ${limit}-email limit): ${partsText}.`,
  };
}

/** Simulate all active schedules and queued imports across calendar days in America/Chicago. */
export function buildSendPlan(opts: {
  schedules: PlanScheduleInput[];
  queuedImports?: PlanQueuedInput[];
  queueSendTime?: string | null;
  dailyCap?: number;
  dailyLimit?: number;
  now?: Date;
}): Map<string, SchedulePlan> {
  const capPerDay = Math.max(1, opts.dailyCap ?? DEFAULT_DAILY_BATCH_CAP);
  const limit = opts.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  const qTime = opts.queueSendTime || DEFAULT_QUEUE_SEND_TIME;
  const qTimeLabel = planTimeLabel(qTime);

  const active = opts.schedules
    .filter((s) => !s.paused && s.next_at && s.recipientCount > 0)
    .sort((a, b) => Date.parse(a.next_at!) - Date.parse(b.next_at!));

  const out = new Map<string, SchedulePlan>();
  if (!active.length) return out;

  type CarryItem = {
    sourceId: string;
    sourceName: string;
    sourceWeekday: string;
    remaining: number;
    batches?: PlanBatch[];
  };

  const carry: CarryItem[] = [];
  for (const q of opts.queuedImports || []) {
    if (q.pending > 0) {
      const d = planCtDay(q.created_at);
      carry.push({
        sourceId: q.id,
        sourceName: q.name,
        sourceWeekday: planWeekdayLabel(d),
        remaining: q.pending,
      });
    }
  }

  const prepared = active.map((s) => {
    const startDay = planCtDay(s.next_at!);
    const startTime = planCtHm(s.next_at!);
    return {
      ...s,
      startDay,
      startTime,
      startTimeLabel: planTimeLabel(startTime),
      batches: [] as PlanBatch[],
      priorCarryoverCount: 0,
      priorCarryoverFrom: null as string | null,
      priorCarryoverWeekday: null as string | null,
      started: false,
    };
  });

  // Compute clean non-overlapping start dates if each schedule waited for the prior one to finish
  const cleanDates = new Map<string, string>();
  let freeDay = prepared[0].startDay;
  if (carry.length > 0 && opts.now) {
    const totalQueued = carry.reduce((n, c) => n + c.remaining, 0);
    const queuedDays = Math.ceil(totalQueued / capPerDay);
    const afterQueued = planAddDays(planCtDay(opts.now), queuedDays);
    if (afterQueued > freeDay) freeDay = afterQueued;
  }
  for (const s of prepared) {
    const start = s.startDay > freeDay ? s.startDay : freeDay;
    cleanDates.set(s.id, start);
    const daysNeeded = Math.max(1, Math.ceil(s.recipientCount / capPerDay));
    freeDay = planAddDays(start, daysNeeded);
  }

  let curDay = prepared[0].startDay;
  if (carry.length > 0 && opts.now) {
    const today = planCtDay(opts.now);
    if (today < curDay) curDay = today;
  }

  for (let guard = 0; guard < 90; guard++) {
    const anyUnstarted = prepared.some((s) => !s.started);
    const anyCarry = carry.some((c) => c.remaining > 0);
    if (!anyUnstarted && !anyCarry) break;

    let cap = capPerDay;
    let carryoverUsedToday = 0;
    let carryoverFromName: string | null = null;
    let carryoverFromWeekday: string | null = null;

    // 1. Morning daily queue run at qTime (e.g. 8:30 AM CT) for carryover from earlier days
    for (const c of carry) {
      if (c.remaining <= 0 || cap <= 0) continue;
      const take = Math.min(cap, c.remaining);
      c.remaining -= take;
      cap -= take;
      carryoverUsedToday += take;
      if (!carryoverFromName) {
        carryoverFromName = c.sourceName;
        carryoverFromWeekday = c.sourceWeekday;
      }
      if (c.batches) {
        c.batches.push({
          day: curDay,
          dayLabel: planDayLabel(curDay),
          weekdayLabel: planWeekdayLabel(curDay),
          time: qTime,
          timeLabel: qTimeLabel,
          count: take,
          isCarryover: true,
        });
      }
    }

    // 2. Schedules whose next_at falls on curDay
    for (const s of prepared) {
      if (s.started || s.startDay !== curDay) continue;
      s.started = true;
      s.priorCarryoverCount = carryoverUsedToday;
      s.priorCarryoverFrom = carryoverFromName;
      s.priorCarryoverWeekday = carryoverFromWeekday;

      const sentInitial = Math.min(cap, s.recipientCount);
      cap -= sentInitial;
      if (sentInitial > 0) {
        s.batches.push({
          day: curDay,
          dayLabel: planDayLabel(curDay),
          weekdayLabel: planWeekdayLabel(curDay),
          time: s.startTime,
          timeLabel: s.startTimeLabel,
          count: sentInitial,
          isCarryover: false,
        });
      }
      const rem = s.recipientCount - sentInitial;
      if (rem > 0) {
        carry.push({
          sourceId: s.id,
          sourceName: s.name,
          sourceWeekday: planWeekdayLabel(curDay),
          remaining: rem,
          batches: s.batches,
        });
      }
    }

    curDay = planAddDays(curDay, 1);
  }

  for (const s of prepared) {
    const count = s.recipientCount;
    const batches = s.batches;
    let summary = '';
    if (batches.length === 1) {
      const b0 = batches[0];
      summary = `Sending to ${count} contacts: all ${count} go out ${b0.weekdayLabel} (${b0.dayLabel}) at ${b0.timeLabel}.`;
    } else if (batches.length === 2) {
      const [b0, b1] = batches;
      summary = `Sending to ${count} contacts: ~${b0.count} go out ${b0.weekdayLabel} (${b0.dayLabel}) at ${b0.timeLabel}, and the remaining ~${b1.count} finish automatically ${b1.weekdayLabel} (${b1.dayLabel}) at ${b1.timeLabel} (daily ${limit}-email limit).`;
    } else if (batches.length >= 3) {
      const list = batches.map((b, i) =>
        i === batches.length - 1
          ? `and the remaining ~${b.count} on ${b.weekdayLabel} (${b.dayLabel}) at ${b.timeLabel}`
          : `~${b.count} on ${b.weekdayLabel} (${b.dayLabel}) at ${b.timeLabel}`
      ).join(', ');
      summary = `Sending to ${count} contacts across ${batches.length} batches (daily ${limit}-email limit): ${list}.`;
    }

    const cleanDate = cleanDates.get(s.id) || null;
    const needsMove = cleanDate && cleanDate > s.startDay;
    const suggestedMoveDate = needsMove ? cleanDate : null;
    const suggestedMoveLabel = suggestedMoveDate
      ? `Move to ${planDayLabel(suggestedMoveDate)} at ${s.startTimeLabel}`
      : null;

    let overlapNotice: string | null = null;
    if (s.priorCarryoverCount > 0 && s.priorCarryoverFrom) {
      const firstOnStartDay = batches[0] && batches[0].day === s.startDay && !batches[0].isCarryover ? batches[0].count : 0;
      const restCount = count - firstOnStartDay;
      const lastBatch = batches[batches.length - 1];
      const moveDayText = suggestedMoveDate ? planWeekdayLabel(suggestedMoveDate) + ` (${planDayLabel(suggestedMoveDate)})` : 'a later day';
      if (batches.length === 2 && firstOnStartDay > 0) {
        overlapNotice = `Heads-up: ${s.priorCarryoverWeekday || 'The earlier'}'s send (“${s.priorCarryoverFrom}”) finishes its last ~${s.priorCarryoverCount} contacts ${planWeekdayLabel(s.startDay)} morning at ${qTimeLabel}, so ${planWeekdayLabel(s.startDay)}'s email (${count} contacts) will send ~${firstOnStartDay} on ${planWeekdayLabel(s.startDay)} at ${s.startTimeLabel} and finish the remaining ~${restCount} on ${lastBatch.weekdayLabel} at ${lastBatch.timeLabel}. You can leave it as-is or move ${planWeekdayLabel(s.startDay)}'s send to ${moveDayText}.`;
      } else {
        const batchDesc = batches.map((b, i) =>
          i === batches.length - 1
            ? `finish the last ~${b.count} on ${b.weekdayLabel} (${b.dayLabel}) at ${b.timeLabel}`
            : `send ~${b.count} on ${b.weekdayLabel} (${b.dayLabel}) at ${b.timeLabel}`
        ).join(', ');
        overlapNotice = `Heads-up: ${s.priorCarryoverWeekday || 'An earlier'}'s send (“${s.priorCarryoverFrom}”) finishes ~${s.priorCarryoverCount} contacts ${planWeekdayLabel(s.startDay)} morning at ${qTimeLabel}, so this email (${count} contacts) will ${batchDesc}. You can leave it as-is or move this send to ${moveDayText}.`;
      }
    }

    out.set(s.id, {
      id: s.id,
      newsletter_key: s.newsletter_key,
      name: s.name,
      recipientCount: count,
      startDay: s.startDay,
      startTime: s.startTime,
      startTimeLabel: s.startTimeLabel,
      batches,
      summary,
      overlapNotice,
      priorCarryoverCount: s.priorCarryoverCount,
      priorCarryoverFrom: s.priorCarryoverFrom,
      suggestedMoveDate,
      suggestedMoveTime: s.startTime,
      suggestedMoveLabel,
    });
  }

  return out;
}
