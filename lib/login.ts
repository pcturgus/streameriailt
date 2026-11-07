import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { setSession } from "@/lib/session";

type Opts = {
  provider: string; // twitch | kick | google
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  channel?: {
    platform: Platform;
    platformId: string;
    login: string;
    url: string;
    displayName?: string; // jei kanalo pavadinimas skiriasi nuo vartotojo vardo (pvz. YouTube)
    avatarUrl?: string | null;
    followers?: number;
  };
};

// Bendra prisijungimo pabaiga: randa arba sukuria vartotoją, susieja kanalą, įjungia sesiją
export async function finishLogin(o: Opts) {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: o.provider, providerAccountId: o.accountId } },
  });

  const user = account
    ? await prisma.user.update({
        where: { id: account.userId },
        data: { displayName: o.displayName, avatarUrl: o.avatarUrl },
      })
    : await prisma.user.create({
        data: {
          displayName: o.displayName,
          avatarUrl: o.avatarUrl,
          accounts: { create: { provider: o.provider, providerAccountId: o.accountId } },
        },
      });

  // Prisijungimas įrodo, kad žmogus valdo šį kanalą. Kanalas aktyvuojamas iš karto (be patvirtinimo).
  if (o.channel) {
    const c = o.channel;
    const displayName = c.displayName ?? o.displayName;
    const avatarUrl = c.avatarUrl !== undefined ? c.avatarUrl : o.avatarUrl;
    const key = { platform_platformId: { platform: c.platform, platformId: c.platformId } };
    const existing = await prisma.channel.findUnique({ where: key });
    // Iš naujo aktyvuojame tik jei kanalas nebuvo aktyvus; užblokuotų (REJECTED) neliečiame
    const reactivate = !!existing && existing.status !== "APPROVED" && existing.status !== "REJECTED";
    await prisma.channel.upsert({
      where: key,
      update: {
        ownerId: user.id, verified: true, login: c.login, displayName, avatarUrl, url: c.url,
        ...(c.followers !== undefined ? { followers: c.followers } : {}),
        ...(reactivate ? { status: "APPROVED", activatedAt: new Date() } : {}),
      },
      create: {
        platform: c.platform, platformId: c.platformId, login: c.login, displayName, avatarUrl,
        url: c.url, language: "lt", status: "APPROVED", activatedAt: new Date(), verified: true,
        ownerId: user.id, followers: c.followers ?? 0,
      },
    });
  }

  await setSession(user.id);
  return user;
}
