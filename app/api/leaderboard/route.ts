import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

// GET /api/leaderboard?page=1&tab=main|rising&platform=TWITCH|KICK|YOUTUBE
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const period = sp.get("tab") === "rising" ? "rising" : "30d";
  const pf = (sp.get("platform") ?? "").toUpperCase();
  const platform = pf in Platform ? (pf as Platform) : undefined;

  const where = {
    period,
    channel: { status: "APPROVED" as const, ...(platform ? { platform } : {}) },
  };
  const total = await prisma.ranking.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1), totalPages);

  const rows = await prisma.ranking.findMany({
    where,
    include: { channel: true },
    orderBy: { rank: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Paskutinių 7 dienų žiūrovų vidurkiai kiekvienam kanalui (mažam grafikui)
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
  const ids = rows.map((r) => r.channelId);
  const stats = ids.length
    ? await prisma.channelStat.findMany({
        where: { channelId: { in: ids }, date: { gte: from } },
        select: { channelId: true, date: true, avgViewers: true },
      })
    : [];
  const spark = new Map<string, number[]>(ids.map((id) => [id, Array(7).fill(0)]));
  for (const st of stats) {
    const idx = Math.round((st.date.getTime() - from.getTime()) / 86_400_000);
    if (idx >= 0 && idx < 7) spark.get(st.channelId)![idx] = st.avgViewers;
  }

  const items = rows.map((r) => ({ ...r, spark: spark.get(r.channelId) ?? [] }));
  return NextResponse.json({ period, items, total, page, pageSize: PAGE_SIZE, totalPages });
}
