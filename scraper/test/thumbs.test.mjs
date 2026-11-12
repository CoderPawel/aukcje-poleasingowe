import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mirrorThumbs, pruneThumbs, sniffImage } from '../lib/thumbs.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

test('sniffImage recognises formats by magic bytes and rejects HTML', () => {
  assert.equal(sniffImage(JPEG), 'image/jpeg');
  assert.equal(sniffImage(WEBP), 'image/webp');
  assert.equal(sniffImage(Buffer.from('<html><head></head></html>')), null);
});

test('mirrorThumbs downloads once, respects the budget and pruneThumbs drops unused copies', async () => {
  const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbs-'));
  const calls = [];
  const fetchImage = async (url) => {
    calls.push(url);
    if (url.endsWith('bad')) return Buffer.from('<html>blocked</html>');
    return url.endsWith('.webp') ? WEBP : JPEG;
  };
  const make = () => [
    { id: 'a', image: 'https://x.pl/a.jpg' },
    { id: 'b', image: 'https://x.pl/b.webp' },
    { id: 'c', image: 'https://x.pl/bad' },
    { id: 'd', image: 'https://x.pl/d.jpg' },
  ];

  const first = make();
  await mirrorThumbs(first, { siteDir, sourceId: 'demo', fetchImage, maxNew: 3 });
  assert.match(first[0].thumb, /^thumbs\/demo\/[0-9a-f]{20}\.jpg$/);
  assert.match(first[1].thumb, /\.webp$/);
  assert.equal(first[2].thumb, undefined, 'HTML is not stored as an image');
  assert.equal(first[3].thumb, undefined, 'budget of 3 downloads (including failures) is used up');

  const second = make();
  await mirrorThumbs(second, { siteDir, sourceId: 'demo', fetchImage, maxNew: 3 });
  assert.equal(calls.filter((u) => u.endsWith('a.jpg')).length, 1, 'existing copies are reused');
  assert.ok(second[3].thumb);

  const removed = await pruneThumbs([second[1]], siteDir);
  assert.equal(removed, 2);
  assert.deepEqual(await fs.readdir(path.join(siteDir, 'thumbs', 'demo')), [path.basename(second[1].thumb)]);
  await fs.rm(siteDir, { recursive: true });
});
