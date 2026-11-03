import sharp from 'sharp';
import { imageType, MAX_LOGO_BYTES } from './branding.js';
export async function validateLogo(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid logo');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('Only PNG, JPEG and WebP logos are supported');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw new Error('Logo must be at most 256 KB');
  if (imageType(bytes) !== match[1]) throw new Error('Logo signature does not match its file type');
  const image = sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: 'warning' });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages || 1) !== 1) throw new Error('Use a static logo up to 4096 × 4096 pixels');
  // Decode and re-encode: strip metadata and appended executable/polyglot content.
  const clean = await image.rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
  if (clean.length > MAX_LOGO_BYTES) throw new Error('Optimized logo exceeds 256 KB');
  return `data:image/webp;base64,${clean.toString('base64')}`;
}
