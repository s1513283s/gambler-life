import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, loadAchievements, recordAchievements } from '../analytics/achievements';
import type { KeyValueStore } from '../analytics/runlog';
import { decodeShare, encodeShare, shareToEntry } from '../analytics/share';
import { CONFIG } from '../config';
import { VENUE_IDS, type GameState } from '../types';
import { EVENTS, applyEffect, eventDef } from './events';
import { OBSESSIONS } from './obsessions';
import { createTitleState, reduce } from './reducer';

function newRun(seed = 1): GameState {
  return reduce(createTitleState(), { type: 'NEW_RUN', seed, runId: `s-${seed}`, mode: 'free', dailyKey: null, background: 'normal' });
}

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** 讓今晚一定觸發指定事件 */
function nightWith(s: GameState, id: GameState['scheduled'][number]['id']): GameState {
  s = { ...s, scheduled: [{ day: s.day, id }] };
  return reduce(s, { type: 'END_DAY' });
}

describe('event chains', () => {
  it('scheduled events fire on their day and choices apply their effects', () => {
    let s = nightWith(newRun(), 'landlord_raise');
    expect(s.night?.step).toBe('EVENT');
    expect(reduce(s, { type: 'NIGHT_ACK_EVENT' })).toBe(s); // 選擇題不能直接確認
    expect(reduce(s, { type: 'NIGHT_CHOOSE', index: 9 })).toBe(s);
    s = reduce(s, { type: 'NIGHT_CHOOSE', index: 2 }); // 拖著不理
    expect(s.night?.step).toBe('SETTLE');
    expect(s.scheduled.some((e) => e.id === 'landlord_return')).toBe(true);
    expect(s.sanity).toBe(CONFIG.SANITY_START - 5);
  });

  it('rolled follow-ups show a result line and need an ack', () => {
    let s = reduce(newRun(), { type: 'REST' });
    s = nightWith(s, 'friend_venture_result');
    expect(s.night?.step).toBe('EVENT');
    if (s.night?.step !== 'EVENT') return;
    expect(s.night.resultText).not.toBeNull();
    s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
    expect(s.night?.step).toBe('SETTLE');
  });

  it('family leaves after enough refusals, only once, and marks the ruined ending on death', () => {
    let s = newRun();
    for (let i = 0; i < 4; i++) s = applyEffect(s, { family: -1 }).state;
    expect(s.scheduled.filter((e) => e.id === 'family_leaves')).toHaveLength(1);
    s = applyEffect(s, { family: -1 }).state;
    expect(s.scheduled.filter((e) => e.id === 'family_leaves')).toHaveLength(1);
    s = nightWith(s, 'family_leaves');
    s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
    expect(s.relations.familyGone).toBe(true);
    const dead = reduce({ ...s, night: { ...s.night!, outcome: 'DEATH', deathCause: 'RENT' } as GameState['night'] }, { type: 'NEXT_DAY' });
    expect(dead.phase).toBe('DEATH');
    expect(dead.ending).toBe('ruined');
  });

  it('breaking a promise to family schedules the fallout', () => {
    let s = reduce(newRun(), { type: 'BORROW', amount: CONFIG.LOAN_UNIT });
    s = reduce(s, { type: 'ACK_UNLOCK' });
    s = applyEffect(s, { promise: true }).state;
    expect(s.promiseUntilDay).toBe(s.day + CONFIG.PROMISE_DAYS);
    s = reduce(s, { type: 'ENTER_VENUE', venue: 'baccarat' });
    expect(s.scheduled.some((e) => e.id === 'family_promise_broken')).toBe(true);
    expect(s.promiseUntilDay).toBe(0);
  });

  it('every event id referenced by a schedule or roll exists', () => {
    for (const e of EVENTS) {
      const refs = [e.schedule?.id, ...(e.choices ?? []).map((c) => c.effects.schedule?.id)].filter((x): x is NonNullable<typeof x> => x !== undefined);
      for (const id of refs) expect(() => eventDef(id)).not.toThrow();
    }
  });
});

describe('jobs, obsession, endings', () => {
  it('jobs pay differently and delivery is random within range', () => {
    const s = newRun();
    const day = reduce(s, { type: 'WORK', job: 'day' });
    const night = reduce(s, { type: 'WORK', job: 'night' });
    const delivery = reduce(s, { type: 'WORK', job: 'delivery' });
    expect(day.cash - s.cash).toBe(800);
    expect(night.cash - s.cash).toBe(700);
    expect(night.sanity).toBe(s.sanity - 10);
    expect(delivery.cash - s.cash).toBeGreaterThanOrEqual(500);
    expect(delivery.cash - s.cash).toBeLessThanOrEqual(1300);
    expect(reduce(day, { type: 'WORK', job: 'night' })).toBe(day);
  });

  it('every run draws an obsession and rewards it once', () => {
    const s = newRun(3);
    expect(OBSESSIONS.some((o) => o.id === s.obsession.id)).toBe(true);
    const forced = { ...s, obsession: { id: 'survive30' as const, done: false }, day: 30 };
    const done = reduce(forced, { type: 'REST' });
    expect(done.obsession.done).toBe(true);
    expect(done.cash).toBe(s.cash + CONFIG.OBSESSION_REWARD_CASH);
    const again = reduce(done, { type: 'END_DAY' });
    expect(again.cash).toBeLessThanOrEqual(done.cash + 5000); // 不會再發第二次獎金
  });

  it('flee needs deep debt and the ticket money', () => {
    let s = reduce(newRun(), { type: 'BORROW', amount: CONFIG.LOAN_CAP });
    s = reduce(s, { type: 'ACK_UNLOCK' });
    expect(reduce({ ...s, cash: 1000 }, { type: 'FLEE' }).phase).toBe('ACTION');
    const fled = reduce({ ...s, cash: 100000 }, { type: 'FLEE' });
    expect(fled.phase).toBe('RETIRED');
    expect(fled.ending).toBe('fled');
    expect(fled.cash).toBe(100000 - CONFIG.FLEE_COST);
  });

  it('sober offer appears after enough clean days and ends the run', () => {
    let s: GameState = { ...newRun(), day: CONFIG.SOBER_MIN_DAY, daysSinceGamble: CONFIG.SOBER_DAYS - 1, stats: { ...newRun().stats, daysGambled: 2 }, scheduled: [] };
    s = reduce({ ...s, rngState: 0 }, { type: 'END_DAY' });
    if (s.night?.step === 'EVENT') {
      const choices = eventDef(s.night.event).choices;
      if (choices && s.night.resultText === null) s = reduce(s, { type: 'NIGHT_CHOOSE', index: choices.length - 1 });
      if (s.night?.step === 'EVENT') s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
    }
    expect(s.night?.step).toBe('SETTLE');
    if (s.night?.step !== 'SETTLE') return;
    expect(s.night.outcome).toBe('SOBER_OFFER');
    const sober = reduce(s, { type: 'SOBER' });
    expect(sober.phase).toBe('RETIRED');
    expect(sober.ending).toBe('sober');
  });
});

describe('venue depth', () => {
  it('VIP table needs tier 3, has a higher minimum and lower commission', () => {
    const s = { ...newRun(), unlockedVenues: [...VENUE_IDS], cash: 100000 };
    const poor = { ...newRun(), cash: 100000 };
    expect(reduce(poor, { type: 'ENTER_VENUE', venue: 'baccarat', vip: true })).toBe(poor);
    let v = reduce(s, { type: 'ENTER_VENUE', venue: 'baccarat', vip: true });
    expect(v.venue?.kind === 'baccarat' && v.venue.vip).toBe(true);
    expect(reduce(v, { type: 'BACCARAT_BET', side: 'banker', stake: 1000 })).toBe(v);
    v = reduce(v, { type: 'BACCARAT_BET', side: 'banker', stake: CONFIG.VIP_MIN_BET });
    expect(v.stats.totalEvGiven).toBeCloseTo(CONFIG.VIP_MIN_BET * CONFIG.VIP_BANKER_EDGE);
    v = reduce(v, { type: 'BACCARAT_RESOLVE' });
    expect(v.venue?.kind === 'baccarat' && v.venue.road.length).toBe(1);
  });

  it('meme coin resolves instantly and counts moons and rugs', () => {
    let s = reduce({ ...newRun(), cash: 50000 }, { type: 'ENTER_VENUE', venue: 'crypto' });
    let moons = 0;
    let rugs = 0;
    for (let i = 0; i < 40; i++) {
      s = reduce({ ...s, rngState: i * 13 }, { type: 'CRYPTO_MEME', stake: 500 });
      if (s.venue?.kind === 'crypto' && s.venue.lastMeme?.moon) moons += 1;
      else rugs += 1;
    }
    expect(s.stats.memeMoons).toBe(moons);
    expect(s.stats.memeRugs).toBe(rugs);
    expect(moons + rugs).toBe(40);
    expect(reduce(s, { type: 'CRYPTO_MEME', stake: 100 })).toBe(s);
  });

  it('streaks are tracked per session', () => {
    let s = reduce({ ...newRun(), unlockedVenues: [...VENUE_IDS], cash: 50000 }, { type: 'ENTER_VENUE', venue: 'baccarat' });
    let best = 0;
    for (let i = 0; i < 30; i++) {
      s = reduce(s, { type: 'BACCARAT_BET', side: 'banker', stake: 100 });
      s = reduce(s, { type: 'BACCARAT_RESOLVE' });
      best = Math.max(best, s.venueStreak);
    }
    expect(s.stats.maxWinStreak).toBe(best);
    expect(s.stats.venuesVisited).toContain('baccarat');
  });
});

describe('achievements and share codes', () => {
  it('records new achievements once per store', () => {
    const store = memStore();
    const s = { ...newRun(), phase: 'DEATH' as const, day: 25, stats: { ...newRun().stats, causeOfDeath: 'RENT' as const } };
    const fresh = recordAchievements(store, s);
    expect(fresh.map((a) => a.id)).toEqual(expect.arrayContaining(['first_run', 'survive20', 'rent_death']));
    expect(recordAchievements(store, s)).toHaveLength(0);
    expect(loadAchievements(store).length).toBe(fresh.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThan(20);
  });

  it('share codes round-trip and reject tampering', () => {
    const payload = { days: 31, peak: 84300, cause: '付不出房租', background: 'rich' as const, mode: 'daily' as const, dailyKey: '2026-09-07', retired: false };
    const code = encodeShare(payload);
    expect(decodeShare(code)).toEqual(payload);
    expect(() => decodeShare(code.slice(0, -1) + '0')).toThrow();
    expect(() => decodeShare('hello')).toThrow();
    const entry = shareToEntry(payload, code);
    expect(entry.shared).toBe(true);
    expect(entry.days).toBe(31);
  });
});
