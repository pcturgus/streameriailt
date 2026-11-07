import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveChannel } from "@/lib/resolve";

export const dynamic = "force-dynamic";

const HOSTS: Record<Platform, string[]> = {
  TWITCH: ["twitch.tv", "www.twitch.tv"],
  KICK: ["kick.com", "www.kick.com"],
  YOUTUBE: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
};

const schema = z.object({
  channelName: z.string().trim().max(60).nullish(),
  platform: z.nativeEnum(Platform),
  url: z.string().url().max(300),
});

// Paprasta apsauga nuo piktnaudžiavimo: ne daugiau kaip 5 kanalai per valandą iš vieno adreso
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

// POST /api/submissions -> kanalas pridedamas iš karto (be patvirtinimo)
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "Per daug bandymų. Pabandykite vėliau." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingi duomenys" }, { status: 400 });
  const { platform, url } = parsed.data;

  const host = new URL(url).hostname.toLowerCase();
  if (!HOSTS[platform].includes(host)) {
    return NextResponse.json({ error: "Nuoroda neatitinka pasirinktos platformos" }, { status: 400 });
  }

  let ch;
  try {
    ch = await resolveChannel(platform, url);
  } catch {
    return NextResponse.json({ error: "Nepavyko pasiekti platformos. Pabandykite vėliau." }, { status: 502 });
  }
  if (!ch) return NextResponse.json({ error: "Kanalas nerastas. Patikrinkite nuorodą." }, { status: 404 });

  const existing = await prisma.channel.findUnique({
    where: { platform_platformId: { platform: ch.platform, platformId: ch.platformId } },
  });
  if (existing?.status === "REJECTED") {
    return NextResponse.json({ error: "Šio kanalo pridėti negalima." }, { status: 403 });
  }

  // Aktyvuojame iš naujo tik jei kanalas dar nebuvo aktyvus (taip 5 dienų laikas nėra pratęsiamas be streamų)
  const reactivate = !existing || existing.status !== "APPROVED";
  await prisma.channel.upsert({
    where: { platform_platformId: { platform: ch.platform, platformId: ch.platformId } },
    update: {
      login: ch.login, displayName: ch.displayName, avatarUrl: ch.avatarUrl, url: ch.url,
      ...(ch.followers ? { followers: ch.followers } : {}),
      ...(reactivate ? { status: "APPROVED", activatedAt: new Date() } : {}),
    },
    create: {
      platform: ch.platform, platformId: ch.platformId, login: ch.login, displayName: ch.displayName,
      avatarUrl: ch.avatarUrl, url: ch.url, followers: ch.followers, language: "lt",
      status: "APPROVED", activatedAt: new Date(),
    },
  });

  await prisma.channelSubmission.create({
    data: { channelName: ch.displayName, platform: ch.platform, url, status: "APPROVED" },
  });

  return NextResponse.json({ channel: { displayName: ch.displayName, url: ch.url } }, { status: 201 });
}
