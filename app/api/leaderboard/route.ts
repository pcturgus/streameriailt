import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

// GET /api/leaderboard?page=1 -> naujausio laikotarpio reitingas, po 10 kanalų puslapyje
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;

  const latest = await prisma.ranking.findFirst({
    orderBy: { period: "desc" },
    select: { period: true },
  });
  if (!latest) {
    return NextResponse.json({ period: null, items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 });
  }

  const where = { period: latest.period, channel: { status: "APPROVED" as const } };
  const total = await prisma.ranking.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1), totalPages);

  const items = await prisma.ranking.findMany({
    where,
    include: { channel: { include: { stats: { orderBy: { date: "desc" }, take: 1 } } } },
    orderBy: { rank: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return NextResponse.json({ period: latest.period, items, total, page, pageSize: PAGE_SIZE, totalPages });
}
