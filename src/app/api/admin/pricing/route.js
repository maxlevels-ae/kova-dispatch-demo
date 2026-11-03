import { CURRENCY } from '@/lib/currency';
import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import EgpPricingRule from '@/lib/db/models/EgpPricingRule';
import { requireAuth } from '@/lib/auth/helpers';

const ruleSchema = z.object({
  vehicleType: z.enum(['economy', 'comfort', 'premium', 'xl']),
  city: z.string().trim().min(1).max(60).default('default'),
  baseFare: z.number().min(0).max(100),
  perKmRate: z.number().min(0).max(50),
  perMinRate: z.number().min(0).max(20),
  minimumFare: z.number().min(0).max(200),
  bookingFee: z.number().min(0).max(50),
  platformCommission: z.number().min(0).max(50),
  surgeMultiplierCap: z.number().min(1).max(10),
  isActive: z.boolean().default(true),
});

// GET /api/admin/pricing — all pricing rules
export async function GET() {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();
    const rules = await EgpPricingRule.find({ currency: CURRENCY }).sort({ city: 1, vehicleType: 1 }).lean();
    return Response.json({ rules });
  } catch (err) {
    console.error('Pricing rules error:', err);
    return Response.json({ error: 'Failed to fetch pricing rules' }, { status: 500 });
  }
}

// PUT /api/admin/pricing — upsert a rule for (vehicleType, city)
export async function PUT(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = ruleSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return Response.json(
        { error: `${first?.path?.join('.')}: ${first?.message}` },
        { status: 400 }
      );
    }

    await connectDB();
    const { vehicleType, city, ...rest } = parsed.data;
    await EgpPricingRule.init();
    const rule = await EgpPricingRule.findOneAndUpdate(
      { vehicleType, city },
      { vehicleType, city, ...rest, currency: CURRENCY },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return Response.json({ rule });
  } catch (err) {
    console.error('Pricing upsert error:', err);
    return Response.json({ error: 'Failed to save pricing rule' }, { status: 500 });
  }
}
