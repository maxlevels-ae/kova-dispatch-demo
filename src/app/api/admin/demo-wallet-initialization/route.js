import { z } from "zod";
import { requireAuth } from "@/lib/auth/helpers";
import { validSettingsOrigin } from "@/lib/settings-origin";
import { readSettingsJSON } from "@/lib/settings-http";
import { apiError } from "@/lib/admin-accounts";
import {
  demoWalletPreflight,
  initializeDemoWallets,
  DEMO_CONFIRMATION,
} from "@/lib/demo-wallet-initialization";
export async function GET() {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  try {
    return Response.json(await demoWalletPreflight());
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  if (!validSettingsOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    z.object({ confirmation: z.literal(DEMO_CONFIRMATION) })
      .strict()
      .parse(await readSettingsJSON(request, 1000));
    return Response.json(await initializeDemoWallets(session.user));
  } catch (e) {
    return apiError(e);
  }
}
