import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/leaderboard  -> naujausio laikotarpio TOP 50
export async function GET() {
  const latest = await prisma.ranking.findFirst({
    orderBy: { period: "desc" },
    select: { period: true },
  });
  if (!latest) return NextResponse.json({ period: null, items: [] });

  const items = await prisma.ranking.findMany({
    where: { period: latest.period, channel: { status: "APPROVED" } },
    include: {
      channel: {
        include: { stats: { orderBy: { date: "desc" }, take: 1 } },
      },
    },
    orderBy: { rank: "asc" },
    take: 50,
  });

  return NextResponse.json({ period: latest.period, items });
}
