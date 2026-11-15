import { Platform, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveChannel } from "@/lib/resolve";
import { EXPIRE_DAYS } from "@/lib/config";

export const adminInclude = {
  stats: {
    where: { OR: [{ avgViewers: { gt: 0 } }, { peakViewers: { gt: 0 } }] },
    orderBy: { date: "desc" as const },
    take: 1,
    select: { date: true },
  },
  live: { select: { isLive: true } },
  owner: { select: { displayName: true } },
} satisfies Prisma.ChannelInclude;

export type ChWithExtras = Prisma.ChannelGetPayload<{ include: typeof adminInclude }>;

// Kiek dienų liko iki automatinio pašalinimo (pagal paskutinį aktyvumą arba aktyvavimo datą)
export function daysLeftFor(activatedAt: Date, lastLive: Date | null): number {
  const last = Math.max(activatedAt.getTime(), lastLive ? lastLive.getTime() : 0);
  return Math.ceil((last + EXPIRE_DAYS * 86_400_000 - Date.now()) / 86_400_000);
}

export function toAdminItem(c: ChWithExtras) {
  const lastLive = c.stats[0]?.date ?? null;
  return {
    id: c.id,
    platform: c.platform,
    login: c.login,
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    url: c.url,
    status: c.status,
    verified: c.verified,
    followers: c.followers,
    createdAt: c.createdAt,
    activatedAt: c.activatedAt,
    lastLive,
    isLive: !!c.live?.isLive,
    daysLeft: c.status === "APPROVED" ? daysLeftFor(c.activatedAt, lastLive) : null,
    ownerName: c.owner?.displayName ?? null,
    adminNote: c.adminNote,
  };
}

// Kanalai, kuriems iki pašalinimo liko ne daugiau kaip 3 dienos
export function expiringWhere(): Prisma.ChannelWhereInput {
  const soon = new Date(Date.now() - (EXPIRE_DAYS - 3) * 86_400_000);
  const soonDate = new Date(Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate()));
  return {
    status: "APPROVED",
    activatedAt: { lt: soon },
    NOT: { stats: { some: { date: { gte: soonDate }, OR: [{ avgViewers: { gt: 0 } }, { peakViewers: { gt: 0 } }] } } },
  };
}

export function detectPlatform(input: string): Platform | null {
  const s = input.trim().toLowerCase();
  if (/twitch\.tv\//.test(s)) return "TWITCH";
  if (/kick\.com\//.test(s)) return "KICK";
  if (/(youtube\.com|youtu\.be)\//.test(s) || /^uc[\w-]{22}$/.test(s)) return "YOUTUBE";
  return null;
}

export type AddResult = { input: string; ok: boolean; name?: string; error?: string };

// Prideda (arba iš naujo aktyvuoja) kanalą administratoriaus vardu, nepaisant blokavimo
export async function addChannelAdmin(input: string, fallback: Platform | null): Promise<AddResult> {
  const line = input.trim();
  if (!line) return { input, ok: false, error: "Tuščia eilutė" };
  const platform = detectPlatform(line) ?? fallback;
  if (!platform) return { input, ok: false, error: "Nepavyko nustatyti platformos – pasirinkite ją sąraše" };

  let ch;
  try {
    ch = await resolveChannel(platform, line);
  } catch {
    return { input, ok: false, error: "Nepavyko pasiekti platformos" };
  }
  if (!ch) return { input, ok: false, error: "Kanalas nerastas" };

  try {
    await prisma.channel.upsert({
      where: { platform_platformId: { platform: ch.platform, platformId: ch.platformId } },
      update: {
        login: ch.login, displayName: ch.displayName, avatarUrl: ch.avatarUrl, url: ch.url,
        ...(ch.followers ? { followers: ch.followers } : {}),
        status: "APPROVED", activatedAt: new Date(),
      },
      create: {
        platform: ch.platform, platformId: ch.platformId, login: ch.login, displayName: ch.displayName,
        avatarUrl: ch.avatarUrl, url: ch.url, followers: ch.followers, language: "lt",
        status: "APPROVED", activatedAt: new Date(),
      },
    });
  } catch {
    return { input, ok: false, error: "Duomenų bazės klaida" };
  }
  return { input, ok: true, name: ch.displayName };
}
