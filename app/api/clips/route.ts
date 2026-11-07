import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TOTAL = 12; // kiek klipų rodome
const PER_CHANNEL = 2; // daugiausia klipų iš vieno kanalo

// GET /api/clips -> populiariausi savaitės klipai (ne daugiau kaip 2 iš vieno kanalo)
export async function GET() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const all = await prisma.clip.findMany({
    where: { createdAt: { gte: since }, hidden: false, channel: { status: "APPROVED" } },
    include: { channel: true },
    orderBy: { views: "desc" },
    take: 100,
  });

  const perChannel = new Map<string, number>();
  const clips: typeof all = [];
  for (const c of all) {
    const n = perChannel.get(c.channelId) ?? 0;
    if (n >= PER_CHANNEL) continue;
    perChannel.set(c.channelId, n + 1);
    clips.push(c);
    if (clips.length >= TOTAL) break;
  }

  return NextResponse.json({ clips });
}
