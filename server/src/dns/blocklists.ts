import fs from 'node:fs';
import path from 'node:path';
import { CATEGORY_IDS, type CategoryId } from '@kinshield/shared';

/**
 * Upstream lists we pull for each category.
 *
 * IMPORTANT for a commercial product: check each list's licence before
 * shipping. StevenBlack (MIT) and URLhaus (CC0) are permissive. To improve
 * coverage, add curated lists such as HaGeZi (GPL-3.0) or OISD - read their
 * terms first - and swap in a commercial threat feed for "security" once
 * revenue allows. The StevenBlack base list mixes ads and malware; we file it
 * under "ads" so security stays a clean, free category.
 */
export const SOURCES: { category: CategoryId; url: string }[] = [
  { category: 'adult', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts' },
  { category: 'security', url: 'https://urlhaus.abuse.ch/downloads/hostfile/' },
  { category: 'ads', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts' },
  { category: 'gambling', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts' },
  { category: 'social', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts' },
];

/** Parses hosts files ("0.0.0.0 example.com"), plain domain lists and adblock "||example.com^" rules. */
export function parseList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = raw.replace(/[#!].*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('||')) line = line.slice(2).replace(/\^.*$/, '');
    const parts = line.split(/\s+/);
    let domain = (parts.length > 1 ? parts[1] : parts[0])!.toLowerCase().replace(/\.$/, '');
    if (domain.startsWith('*.')) domain = domain.slice(2);
    if (!domain || domain === 'localhost' || domain === '0.0.0.0' || !domain.includes('.')) continue;
    if (!/^[a-z0-9._-]+$/.test(domain)) continue;
    out.push(domain);
  }
  return out;
}

/** Yields "a.b.example.com", "b.example.com", "example.com", "com". */
export function* suffixes(domain: string): Generator<string> {
  let d = domain;
  while (true) {
    yield d;
    const i = d.indexOf('.');
    if (i < 0) return;
    d = d.slice(i + 1);
  }
}

export interface BlocklistLookup {
  /** Returns the first matching category among `enabled`, checking the domain and all its parents. */
  match(domain: string, enabled: Iterable<CategoryId>): CategoryId | null;
}

export class Blocklists implements BlocklistLookup {
  private sets = new Map<CategoryId, Set<string>>();

  constructor(initial?: Partial<Record<CategoryId, string[]>>) {
    for (const id of CATEGORY_IDS) this.sets.set(id, new Set(initial?.[id] ?? []));
  }

  add(category: CategoryId, domains: Iterable<string>) {
    const set = this.sets.get(category)!;
    for (const d of domains) set.add(d);
  }

  size(category: CategoryId): number {
    return this.sets.get(category)!.size;
  }

  match(domain: string, enabled: Iterable<CategoryId>): CategoryId | null {
    const cats = [...enabled];
    if (cats.length === 0) return null;
    for (const s of suffixes(domain)) {
      for (const c of cats) {
        if (this.sets.get(c)!.has(s)) return c;
      }
    }
    return null;
  }

  /** Loads bundled seed lists plus anything downloaded by `npm run update-blocklists`. */
  static loadFromDisk(seedDir: string, downloadDir: string): Blocklists {
    const lists = new Blocklists();
    for (const id of CATEGORY_IDS) {
      for (const dir of [seedDir, downloadDir]) {
        const file = path.join(dir, `${id}.txt`);
        if (fs.existsSync(file)) lists.add(id, parseList(fs.readFileSync(file, 'utf8')));
      }
    }
    return lists;
  }
}
