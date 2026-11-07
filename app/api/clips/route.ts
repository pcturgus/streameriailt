import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clips -> populiariausi savaitės klipai
export async function GET() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const clips = await prisma.clip.findMany({
    where: { createdAt: { gte: since }, channel: { status: "APPROVED" } },
    include: { channel: true },
    orderBy: { views: "desc" },
    take: 12,
  });
  return NextResponse.json({ clips });
}
