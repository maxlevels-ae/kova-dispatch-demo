export const DEFAULT_BRANDING = { name: 'Maxride', logo: null, loginLogo: null };
export const MAX_LOGO_BYTES = 256 * 1024;
export const MAX_BRANDING_BODY = 720 * 1024;
export function imageType(bytes) {
  if (bytes.length >= 12 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  return null;
}
