import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site/assets');

test('SVG assets contain no control characters (browsers reject such XML and show a broken image)', async () => {
  for (const f of (await fs.readdir(ASSETS)).filter((n) => n.endsWith('.svg'))) {
    const s = await fs.readFile(path.join(ASSETS, f), 'utf8');
    assert.doesNotMatch(s, /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/, f);
    assert.match(s.trim(), /<\/svg>$/, f);
  }
});
