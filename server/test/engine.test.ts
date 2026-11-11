import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy, clampPolicy } from '@kinshield/shared';
import { Blocklists, parseList } from '../src/dns/blocklists';
import { decide } from '../src/dns/engine';

const lists = new Blocklists({
  adult: ['adult.example'],
  security: ['phish.example'],
  ads: ['doubleclick.net'],
  social: ['tiktok.com'],
});
const now = new Date('2026-11-11T12:00:00Z');

test('parseList understands hosts, domain and adblock formats', () => {
  const text = '# comment\n0.0.0.0 a.com\n127.0.0.1 localhost\nb.com # trailing\n||c.com^\n*.d.com\n';
  assert.deepEqual(parseList(text), ['a.com', 'b.com', 'c.com', 'd.com']);
});

test('free plan blocks adult & malware incl. subdomains but not ads', () => {
  const policy = defaultPolicy('free');
  const ctx = { policy, timezone: 'UTC', now };
  assert.deepEqual(decide('www.adult.example.', ctx, lists), { action: 'block', reason: 'adult' });
  assert.deepEqual(decide('login.phish.example', ctx, lists), { action: 'block', reason: 'security' });
  assert.equal(decide('ad.doubleclick.net', ctx, lists).action, 'allow');
});

test('plus plan blocks ads', () => {
  const ctx = { policy: defaultPolicy('plus'), timezone: 'UTC', now };
  assert.deepEqual(decide('ad.doubleclick.net', ctx, lists), { action: 'block', reason: 'ads' });
});

test('safesearch and youtube rewrites', () => {
  const policy = { ...defaultPolicy('plus'), youtubeRestricted: true };
  const ctx = { policy, timezone: 'UTC', now };
  assert.deepEqual(decide('www.google.co.uk', ctx, lists), {
    action: 'rewrite',
    reason: 'safesearch',
    target: 'forcesafesearch.google.com',
  });
  assert.equal(decide('www.bing.com', ctx, lists).action, 'rewrite');
  assert.deepEqual(decide('www.youtube.com', ctx, lists), {
    action: 'rewrite',
    reason: 'youtube',
    target: 'restrict.youtube.com',
  });
  assert.equal(decide('mail.google.com', ctx, lists).action, 'allow');
});

test('allowlist beats everything, blocklist blocks', () => {
  const policy = { ...defaultPolicy('plus'), allowlist: ['adult.example'], blocklist: ['games.example'] };
  const ctx = { policy, timezone: 'UTC', now };
  assert.equal(decide('adult.example', ctx, lists).action, 'allow');
  assert.deepEqual(decide('play.games.example', ctx, lists), { action: 'block', reason: 'custom' });
});

test('pause blocks everything except OS connectivity checks', () => {
  const policy = { ...defaultPolicy('pro'), pausedUntil: '2026-11-11T13:00:00Z' };
  const ctx = { policy, timezone: 'UTC', now };
  assert.deepEqual(decide('wikipedia.org', ctx, lists), { action: 'block', reason: 'paused' });
  assert.equal(decide('captive.apple.com', ctx, lists).action, 'allow');
  const later = { ...ctx, now: new Date('2026-11-11T14:00:00Z') };
  assert.equal(decide('wikipedia.org', later, lists).action, 'allow');
});

test('focus schedule blocks extra categories only while active', () => {
  const policy = {
    ...defaultPolicy('pro'),
    schedules: [
      {
        id: 'hw',
        name: 'Homework',
        enabled: true,
        days: [3 as const], // Wednesday
        start: '11:00',
        end: '13:00',
        mode: 'focus' as const,
        categories: ['social' as const],
      },
    ],
  };
  assert.deepEqual(decide('www.tiktok.com', { policy, timezone: 'UTC', now }, lists), {
    action: 'block',
    reason: 'schedule',
  });
  const evening = new Date('2026-11-11T18:00:00Z');
  assert.equal(decide('www.tiktok.com', { policy, timezone: 'UTC', now: evening }, lists).action, 'allow');
});

test('a downgraded pro policy stops enforcing paid features', () => {
  const pro = { ...defaultPolicy('pro'), pausedUntil: '2026-11-11T13:00:00Z' };
  const ctx = { policy: clampPolicy(pro, 'free'), timezone: 'UTC', now };
  assert.equal(decide('wikipedia.org', ctx, lists).action, 'allow');
  assert.equal(decide('ad.doubleclick.net', ctx, lists).action, 'allow');
  assert.equal(decide('adult.example', ctx, lists).action, 'block');
});
