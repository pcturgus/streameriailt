import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/admin/clips?q=&hidden=1 -> klipai moderavimui (įskaitant paslėptus)
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const clips = await prisma.clip.findMany({
    where: {
      ...(sp.get("hidden") === "1" ? { hidden: true } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { channel: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { views: "desc" },
    take: 60,
    include: { channel: { select: { displayName: true, platform: true } } },
  });
  return NextResponse.json({ clips });
}
