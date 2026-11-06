import {activeOperations} from '@/lib/operating-areas';
import {validSettingsOrigin} from '@/lib/settings-origin';
import { walletAccount, walletAccounts } from '@/lib/currency';
import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import {mobileContact,phoneCountries} from '@/lib/contact-phone';
import { requireAuth } from '@/lib/auth/helpers';

const updateSchema = z.object({
  phoneCountry: z.string().refine(value=>value===''||phoneCountries.includes(value),'Country code required').optional(),
  name: z.string().trim().min(2,'Contact details incomplete').max(100).optional(),
  phone: z
    .string()
    .trim()
    .max(40, 'Phone number invalid')
    .optional()
    .or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  avatar: z.string().trim().url().max(500).optional().or(z.literal('')),
  savedPlaces: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(50),
        address: z.string().trim().min(1).max(300),
        location: z.object({
          type: z.literal('Point').default('Point'),
          coordinates: z.tuple([z.number(), z.number()]),
        }),
      })
    )
    .max(10)
    .optional(),
});

// GET /api/users/me
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const user = await User.findById(session.user.id).lean();
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const country=(await activeOperations()).country;
    return Response.json({
      user: {
        id: String(user._id),
        username: user.username,
        name: user.name,
        phone: user.phone || '',
        phoneCountry: user.phoneCountry || '',
        email: user.email || '',
        avatar: user.avatar || '',
        role: user.role,
        wallet: walletAccount(user,country.currency) || { balance: 0, currency: country.currency },
        accounts: walletAccounts(user),
        rating: user.rating,
        savedPlaces: user.savedPlaces || [],
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    return Response.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PATCH /api/users/me
export async function PATCH(request) {
  if(!validSettingsOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return Response.json({ error: first?.message || 'Invalid input' }, { status: 400 });
    }

    if(parsed.data.phone){
      const contact=mobileContact(parsed.data.phone,parsed.data.phoneCountry);
      if(contact.error)return Response.json({error:contact.error,field:'phone'},{status:400});
      Object.assign(parsed.data,contact);
    }else if(parsed.data.phone==='')parsed.data.phoneCountry='';
    else delete parsed.data.phoneCountry;

    await connectDB();

    // Drop empty strings so sparse-unique fields stay unset
    const update = {};
    const unset = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === '') unset[key] = 1;
      else if (value !== undefined) update[key] = value;
    }

    const user = await User.findByIdAndUpdate(
      session.user.id,
      {
        ...(Object.keys(update).length ? { $set: update } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { new: true, runValidators: true }
    ).lean();


    return Response.json({
      user: {
        id: String(user._id),
        username: user.username,
        name: user.name,
        phone: user.phone || '',
        phoneCountry: user.phoneCountry || '',
        email: user.email || '',
        avatar: user.avatar || '',
        role: user.role,
        savedPlaces: user.savedPlaces || [],
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return Response.json({ error: `That ${field} is already in use` }, { status: 409 });
    }
    console.error('Update profile error:', err);
    return Response.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
