import { requireAuth } from '@/lib/auth/helpers';
import connectDB from '@/lib/db/mongodb';
import Branding from '@/lib/db/models/Branding';
import { MAX_BRANDING_BODY } from '@/lib/branding';
import { validateLogo } from '@/lib/validate-branding';
export async function PUT(request) {
  const { session, error } = await requireAuth(['admin']);
  if (error) return error;
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Expected JSON' }, { status: 415 });
  let data;
  try {
    const reader = request.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BRANDING_BODY) { await reader.cancel(); return Response.json({ error: 'Upload too large' }, { status: 413 }); }
      chunks.push(Buffer.from(value));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 60 || /[\u0000-\u001f]/.test(body.name)) throw new Error('Brand name must contain 1–60 printable characters');
    data = { name: body.name.trim(), logo: await validateLogo(body.logo), loginLogo: await validateLogo(body.loginLogo) };
  } catch (err) {
    return Response.json({ error: err.message.startsWith('Brand') || err.message.startsWith('Logo') || err.message.startsWith('Only') || err.message.startsWith('Use a') ? err.message : 'Invalid logo or settings payload' }, { status: 400 });
  }
  try {
    await connectDB();
    await Branding.findOneAndUpdate({ _id: 'public' }, { $set: data, $push: { history: { $each: [{ actor: session.user.id, at: new Date(), name: data.name, hasLogo: Boolean(data.logo), hasLoginLogo: Boolean(data.loginLogo) }], $slice: -100 } } }, { upsert: true, runValidators: true });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to save branding. Please retry.' }, { status: 503 });
  }
}
