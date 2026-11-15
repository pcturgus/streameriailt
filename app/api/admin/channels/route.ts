import { NextResponse } from "next/server";
import { ChannelStatus, Platform, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { adminInclude, expiringWhere, toAdminItem } from "@/lib/adminops";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// GET /api/admin/channels?q=&platform=&status=&filter=live|expiring|verified|owned&sort=new|old|followers|name|activated&page=
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const platform = sp.get("platform") ?? "";
  const status = sp.get("status") ?? "";
  const filter = sp.get("filter") ?? "";
  const sort = sp.get("sort") ?? "new";

  const AND: Prisma.ChannelWhereInput[] = [];
  if (platform in Platform) AND.push({ platform: platform as Platform });
  if (status in ChannelStatus) AND.push({ status: status as ChannelStatus });
  if (q) AND.push({ OR: [{ login: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] });
  if (filter === "live") AND.push({ live: { is: { isLive: true } } });
  if (filter === "verified") AND.push({ verified: true });
  if (filter === "owned") AND.push({ ownerId: { not: null } });
  if (filter === "expiring") AND.push(expiringWhere());
  const where: Prisma.ChannelWhereInput = AND.length ? { AND } : {};

  const orderBy: Prisma.ChannelOrderByWithRelationInput =
    sort === "old" ? { createdAt: "asc" }
    : sort === "followers" ? { followers: "desc" }
    : sort === "name" ? { displayName: "asc" }
    : sort === "activated" ? { activatedAt: "desc" }
    : { createdAt: "desc" };

  const total = await prisma.channel.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1), totalPages);

  const rows = await prisma.channel.findMany({
    where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: adminInclude,
  });

  const grouped = await prisma.channel.groupBy({ by: ["status"], _count: true });
  const count = (s: ChannelStatus) => grouped.find((g) => g.status === s)?._count ?? 0;
  const counts = {
    active: count("APPROVED"),
    removed: count("EXPIRED"),
    blocked: count("REJECTED"),
    live: await prisma.liveStream.count({ where: { isLive: true, channel: { status: "APPROVED" } } }),
    users: await prisma.user.count(),
    new24h: await prisma.channel.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
  };

  return NextResponse.json({ items: rows.map(toAdminItem), total, page, pageSize: PAGE_SIZE, totalPages, counts });
}
