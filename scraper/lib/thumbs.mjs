/**
 * Local copies of thumbnails for portals whose images browsers cannot load directly (e.g. a server with an
 * incomplete TLS chain). Files live in site/thumbs/<source>/ – not in git: the workflow keeps the directory
 * in the Actions cache and publishes it with the site. Vehicles get `thumb` (relative path) next to the
 * original `image`, so the site can fall back to the remote URL when a copy is missing.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const MAX_BYTES = 1.5 * 1024 * 1024;

/** Detects the image format from magic bytes (servers often send application/octet-stream). */
export function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.toString('ascii', 4, 12) === 'ftypavif') return 'image/avif';
  return null;
}

const baseName = (url) => createHash('sha1').update(url).digest('hex').slice(0, 20);

async function existing(dir) {
  try {
    return new Map((await fs.readdir(dir)).map((f) => [f.replace(/\.[^.]+$/, ''), f]));
  } catch {
    return new Map();
  }
}

/**
 * Sets `thumb` on vehicles of one source, downloading at most `maxNew` missing images with `fetchImage(url)`
 * (must resolve to a Buffer). Download errors are logged and leave the vehicle with its remote image only.
 */
export async function mirrorThumbs(vehicles, { siteDir, sourceId, fetchImage, maxNew = 300, log = () => {} }) {
  const dir = path.join(siteDir, 'thumbs', sourceId);
  await fs.mkdir(dir, { recursive: true });
  const have = await existing(dir);
  let fetched = 0;
  let failed = 0;
  for (const v of vehicles) {
    if (!v.image || !/^https?:/.test(v.image)) continue;
    const name = baseName(v.image);
    let file = have.get(name);
    if (!file && fetched + failed < maxNew) {
      try {
        const buf = await fetchImage(v.image);
        const type = sniffImage(buf);
        if (!type) throw new Error('to nie jest obraz');
        if (buf.length > MAX_BYTES) throw new Error(`za duży (${buf.length} B)`);
        file = `${name}.${EXT[type]}`;
        await fs.writeFile(path.join(dir, file), buf);
        have.set(name, file);
        fetched++;
      } catch (e) {
        failed++;
        if (failed <= 3) log(`miniatura ${v.image}: ${e.message}`);
      }
    }
    if (file) v.thumb = `thumbs/${sourceId}/${file}`;
  }
  log(`miniatury: ${have.size} w kopii, pobrano ${fetched}, błędów ${failed}`);
}

/** Removes copies no longer referenced by any vehicle. */
export async function pruneThumbs(vehicles, siteDir) {
  const root = path.join(siteDir, 'thumbs');
  const used = new Set(vehicles.map((v) => v.thumb).filter(Boolean));
  let dirs;
  try {
    dirs = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const d of dirs.filter((x) => x.isDirectory())) {
    for (const f of await fs.readdir(path.join(root, d.name))) {
      if (!used.has(`thumbs/${d.name}/${f}`)) {
        await fs.rm(path.join(root, d.name, f));
        removed++;
      }
    }
  }
  return removed;
}
