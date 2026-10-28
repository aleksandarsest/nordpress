import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { passkey, twoFactor, user } from "@/db/schema";

// Two-step login and passkeys, as shown on the profile and to administrators.

export async function securityOf(userId: string) {
  const [[row], keys] = await Promise.all([
    db
      .select({ twoFactorEnabled: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, userId)),
    db
      .select({
        id: passkey.id,
        name: passkey.name,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
        createdAt: passkey.createdAt,
      })
      .from(passkey)
      .where(eq(passkey.userId, userId))
      .orderBy(desc(passkey.createdAt)),
  ]);
  return { twoFactorEnabled: row?.twoFactorEnabled ?? false, passkeys: keys };
}

/**
 * For administrators helping someone who lost their phone and backup codes:
 * turns two-step login off so they can sign in with their password again.
 */
export async function resetTwoFactor(userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(eq(user.id, userId));
  });
}
