import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/streams/live?platform=twitch&category=gaming&q=cs2
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const p = sp.get("platform")?.toUpperCase();
  const platform = p && p in Platform ? (p as Platform) : undefined;
  const category = sp.get("category");
  const q = sp.get("q")?.trim();

  const streams = await prisma.liveStream.findMany({
    where: {
      isLive: true,
      channel: { status: "APPROVED", platform },
      ...(category && category !== "visi" ? { category } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { game: { contains: q, mode: "insensitive" } },
              { channel: { displayName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { channel: true },
    orderBy: { viewers: "desc" },
    take: 60,
  });

  const totals = await prisma.liveStream.aggregate({
    where: { isLive: true, channel: { status: "APPROVED" } },
    _count: true,
    _sum: { viewers: true },
  });

  return NextResponse.json({
    totals: { live: totals._count, viewers: totals._sum.viewers ?? 0 },
    streams,
  });
}
