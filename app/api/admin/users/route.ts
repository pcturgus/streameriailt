import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// GET /api/admin/users?q=&page=
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const where = q ? { displayName: { contains: q, mode: "insensitive" as const } } : {};

  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1), totalPages);

  const users = await prisma.user.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    include: {
      accounts: { select: { provider: true } },
      channels: { select: { id: true, displayName: true, platform: true, status: true } },
    },
  });
  return NextResponse.json({
    items: users.map((u) => ({
      id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl, isAdmin: u.isAdmin, createdAt: u.createdAt,
      providers: u.accounts.map((a) => a.provider), channels: u.channels,
    })),
    total, page, totalPages,
  });
}
