/**
 * Downloads the upstream category lists into BLOCKLIST_DIR.
 * Run on a schedule (e.g. every 6 hours via cron) and restart / SIGHUP the resolver.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { SOURCES, parseList } from './blocklists';

async function main() {
  fs.mkdirSync(config.blocklistDir, { recursive: true });
  const byCategory = new Map<string, Set<string>>();
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const domains = parseList(await res.text());
      const set = byCategory.get(src.category) ?? new Set<string>();
      for (const d of domains) set.add(d);
      byCategory.set(src.category, set);
      console.log(`${src.category}: +${domains.length} from ${src.url}`);
    } catch (err) {
      console.error(`Failed ${src.url}: ${(err as Error).message}`);
    }
  }
  for (const [category, set] of byCategory) {
    const file = path.join(config.blocklistDir, `${category}.txt`);
    fs.writeFileSync(`${file}.tmp`, [...set].join('\n'));
    fs.renameSync(`${file}.tmp`, file);
    console.log(`Wrote ${set.size} domains to ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
