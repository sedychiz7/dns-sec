import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPolicy,
  defaultPolicy,
  hasFeature,
  isScheduleActive,
  lockedFeaturesUsed,
  minimumPlanFor,
  normalizeDomain,
  type Schedule,
} from '../src/index';

test('plans are strictly additive', () => {
  assert.ok(hasFeature('free', 'adultFilter'));
  assert.ok(!hasFeature('free', 'adBlocking'));
  assert.ok(hasFeature('plus', 'adBlocking'));
  assert.ok(!hasFeature('plus', 'profiles'));
  assert.ok(hasFeature('pro', 'profiles'));
  assert.equal(minimumPlanFor('adBlocking'), 'plus');
  assert.equal(minimumPlanFor('schedules'), 'pro');
});

test('free default policy only enables free categories', () => {
  const p = defaultPolicy('free');
  assert.equal(p.categories.adult, true);
  assert.equal(p.categories.security, true);
  assert.equal(p.categories.ads, false);
  assert.equal(p.safeSearch, true);
});

test('downgrade clamps but lockedFeaturesUsed reports what is lost', () => {
  const pro = defaultPolicy('pro');
  pro.categories.social = true;
  pro.blocklist = ['example.com'];
  const clamped = clampPolicy(pro, 'free');
  assert.equal(clamped.categories.ads, false);
  assert.equal(clamped.categories.social, false);
  assert.deepEqual(clamped.blocklist, []);
  assert.deepEqual(new Set(lockedFeaturesUsed(pro, 'free')), new Set(['adBlocking', 'gamblingFilter', 'extraCategories', 'customLists']));
  assert.deepEqual(lockedFeaturesUsed(pro, 'pro'), []);
});

test('overnight schedules belong to the day they start', () => {
  const s: Schedule = {
    id: 's',
    name: 'Bedtime',
    enabled: true,
    days: [0, 1, 2, 3, 4], // Sun-Thu nights
    start: '21:00',
    end: '07:00',
    mode: 'offline',
    categories: [],
  };
  const tz = 'UTC';
  // 2026-11-12 is a Thursday
  assert.equal(isScheduleActive(s, new Date('2026-11-12T22:00:00Z'), tz), true);
  assert.equal(isScheduleActive(s, new Date('2026-11-13T06:59:00Z'), tz), true); // Fri morning, Thu night
  assert.equal(isScheduleActive(s, new Date('2026-11-13T22:00:00Z'), tz), false); // Fri night
  assert.equal(isScheduleActive(s, new Date('2026-11-14T06:00:00Z'), tz), false); // Sat morning
  assert.equal(isScheduleActive(s, new Date('2026-11-12T12:00:00Z'), tz), false);
});

test('schedules respect the network timezone', () => {
  const s: Schedule = {
    id: 's',
    name: 'Homework',
    enabled: true,
    days: [1, 2, 3, 4, 5],
    start: '16:00',
    end: '18:00',
    mode: 'focus',
    categories: ['social'],
  };
  // 17:00 in New York (EST, UTC-5) on Wednesday 2026-11-11 is 22:00 UTC
  assert.equal(isScheduleActive(s, new Date('2026-11-11T22:00:00Z'), 'America/New_York'), true);
  assert.equal(isScheduleActive(s, new Date('2026-11-11T17:00:00Z'), 'America/New_York'), false);
});

test('normalizeDomain', () => {
  assert.equal(normalizeDomain('https://www.TikTok.com/foo?x=1'), 'tiktok.com');
  assert.equal(normalizeDomain('*.example.co.uk.'), 'example.co.uk');
  assert.equal(normalizeDomain('sub.example.com:443'), 'sub.example.com');
  assert.equal(normalizeDomain('not a domain'), null);
  assert.equal(normalizeDomain('localhost'), null);
});
