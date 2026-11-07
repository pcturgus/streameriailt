import { NextResponse } from "next/server";
import { ChannelStatus, Platform, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { resolveChannel } from "@/lib/resolve";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

// GET /api/admin/channels?q=&platform=&status=&page=
export async function GET(req: Request) {
  if (!(await requireAdmin())) return forbidden();

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const platform = sp.get("platform") ?? "";
  const status = sp.get("status") ?? "";

  const where: Prisma.ChannelWhereInput = {
    ...(platform in Platform ? { platform: platform as Platform } : {}),
    ...(status in ChannelStatus ? { status: status as ChannelStatus } : {}),
    ...(q
      ? { OR: [{ login: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] }
      : {}),
  };

  const total = await prisma.channel.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1), totalPages);

  const rows = await prisma.channel.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      stats: {
        where: { OR: [{ avgViewers: { gt: 0 } }, { peakViewers: { gt: 0 } }] },
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true },
      },
    },
  });
  const items = rows.map(({ stats, ...c }) => ({ ...c, lastLive: stats[0]?.date ?? null }));

  const grouped = await prisma.channel.groupBy({ by: ["status"], _count: true });
  const count = (s: ChannelStatus) => grouped.find((g) => g.status === s)?._count ?? 0;
  const counts = {
    active: count("APPROVED"),
    removed: count("EXPIRED"),
    blocked: count("REJECTED"),
    live: await prisma.liveStream.count({ where: { isLive: true, channel: { status: "APPROVED" } } }),
    users: await prisma.user.count(),
  };

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE, totalPages, counts });
}

const addSchema = z.object({ platform: z.nativeEnum(Platform), url: z.string().trim().min(2).max(300) });

// POST /api/admin/channels  { platform, url }  -> prideda (arba iš naujo aktyvuoja) kanalą
export async function POST(req: Request) {
  if (!(await requireAdmin())) return forbidden();

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingi duomenys" }, { status: 400 });

  let ch;
  try {
    ch = await resolveChannel(parsed.data.platform, parsed.data.url);
  } catch {
    return NextResponse.json({ error: "Nepavyko pasiekti platformos" }, { status: 502 });
  }
  if (!ch) return NextResponse.json({ error: "Kanalas nerastas. Patikrinkite nuorodą." }, { status: 404 });

  const key = { platform_platformId: { platform: ch.platform, platformId: ch.platformId } };
  await prisma.channel.upsert({
    where: key,
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
  return NextResponse.json({ ok: true, name: ch.displayName }, { status: 201 });
}
