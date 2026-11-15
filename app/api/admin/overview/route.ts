import { NextResponse } from "next/server";
import { ChannelStatus, Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { adminInclude, expiringWhere, toAdminItem } from "@/lib/adminops";

export const dynamic = "force-dynamic";

// GET /api/admin/overview -> suvestinė, sinchronizacijos būklė, kas reikalauja dėmesio
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grouped = await prisma.channel.groupBy({ by: ["status"], _count: true });
  const count = (s: ChannelStatus) => grouped.find((g) => g.status === s)?._count ?? 0;

  const [live, users, new24h, newest, expiring, rankDay] = await Promise.all([
    prisma.liveStream.count({ where: { isLive: true, channel: { status: "APPROVED" } } }),
    prisma.user.count(),
    prisma.channel.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    prisma.channel.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: adminInclude }),
    prisma.channel.findMany({ where: expiringWhere(), orderBy: { activatedAt: "asc" }, take: 15, include: adminInclude }),
    prisma.rankingHistory.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);

  const sync = await Promise.all(
    (["TWITCH", "KICK", "YOUTUBE"] as Platform[]).map(async (platform) => {
      const agg = await prisma.liveStream.aggregate({
        where: { isLive: true, channel: { platform } },
        _max: { updatedAt: true },
        _count: true,
      });
      const channels = await prisma.channel.count({
        where: { platform, status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
      });
      return { platform, live: agg._count, lastSeen: agg._max.updatedAt, channels };
    })
  );

  return NextResponse.json({
    counts: { active: count("APPROVED"), removed: count("EXPIRED"), blocked: count("REJECTED"), live, users, new24h },
    sync,
    expiring: expiring.map(toAdminItem),
    newest: newest.map(toAdminItem),
    rankingDate: rankDay?.date ?? null,
  });
}
