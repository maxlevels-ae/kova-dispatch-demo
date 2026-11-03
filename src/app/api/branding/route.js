import connectDB from '@/lib/db/mongodb';
import Branding from '@/lib/db/models/Branding';
import { DEFAULT_BRANDING } from '@/lib/branding';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await connectDB();
    const data = await Branding.findById('public').lean();
    return Response.json(data ? { name: data.name, logo: data.logo, loginLogo: data.loginLogo } : DEFAULT_BRANDING, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(DEFAULT_BRANDING, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
