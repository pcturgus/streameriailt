import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/admin/logs -> paskutiniai 100 administratoriaus veiksmų
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ items });
}
