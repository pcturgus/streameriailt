import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/admin/clips -> naujausi klipai moderavimui (įskaitant paslėptus)
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clips = await prisma.clip.findMany({
    orderBy: { views: "desc" },
    take: 60,
    include: { channel: { select: { displayName: true, platform: true } } },
  });
  return NextResponse.json({ clips });
}
