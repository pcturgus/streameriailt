import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdmin } from "@/lib/adminlog";
import { adminInclude, toAdminItem } from "@/lib/adminops";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

// GET /api/admin/channels/:id -> išsami kanalo informacija (šoninei kortelei)
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;
  const ch = await prisma.channel.findUnique({
    where: { id },
    include: { ...adminInclude, live: true, _count: { select: { clips: true } } },
  });
  if (!ch) return NextResponse.json({ error: "Kanalas nerastas" }, { status: 404 });

  const from = new Date(Date.now() - 30 * 86_400_000);
  const stats = await prisma.channelStat.findMany({ where: { channelId: id, date: { gte: from } } });
  const rank = await prisma.ranking.findUnique({ where: { channelId_period: { channelId: id, period: "30d" } } });
  const rankTotal = rank ? await prisma.ranking.count({ where: { period: "30d" } }) : 0;

  return NextResponse.json({
    channel: { ...toAdminItem(ch), platformId: ch.platformId, language: ch.language },
    liveTitle: ch.live?.isLive ? ch.live.title : null,
    rank: rank?.rank ?? null,
    rankTotal,
    score: rank?.score ?? null,
    avgViewers: rank?.avgViewers ?? null,
    hours30: Math.round(stats.reduce((a, s) => a + s.hoursStreamed, 0) * 10) / 10,
    peak30: stats.reduce((a, s) => Math.max(a, s.peakViewers), 0),
    clips: ch._count.clips,
  });
}

// PATCH /api/admin/channels/:id  { action: remove | block | restore | verify | unverify }  arba  { note: string }
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return forbidden();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string; note?: string } | null;

  const ch = await prisma.channel.findUnique({ where: { id }, select: { displayName: true, platform: true } });
  if (!ch) return NextResponse.json({ error: "Kanalas nerastas" }, { status: 404 });
  const who = `${ch.displayName} (${ch.platform})`;

  if (typeof body?.note === "string") {
    await prisma.channel.update({ where: { id }, data: { adminNote: body.note.trim().slice(0, 500) || null } });
    await logAdmin(admin, "Pakeista pastaba", who);
    return NextResponse.json({ ok: true });
  }

  const actions: Record<string, { data: object; label: string }> = {
    remove: { data: { status: "EXPIRED" }, label: "Pašalintas" },
    block: { data: { status: "REJECTED" }, label: "Užblokuotas" },
    restore: { data: { status: "APPROVED", activatedAt: new Date() }, label: "Aktyvuotas" },
    verify: { data: { verified: true }, label: "Patvirtintas" },
    unverify: { data: { verified: false }, label: "Nuimtas patvirtinimas" },
  };
  const a = body?.action ? actions[body.action] : undefined;
  if (!a) return NextResponse.json({ error: "Nežinomas veiksmas" }, { status: 400 });

  await prisma.channel.update({ where: { id }, data: a.data });
  if (body?.action === "remove" || body?.action === "block") {
    await prisma.liveStream.updateMany({ where: { channelId: id }, data: { isLive: false, viewers: 0 } });
  }
  await logAdmin(admin, a.label, who);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/channels/:id -> ištrina kanalą ir visą jo istoriją visam laikui
export async function DELETE(_req: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return forbidden();
  const { id } = await params;
  const ch = await prisma.channel.findUnique({ where: { id }, select: { displayName: true, platform: true } });
  if (!ch) return NextResponse.json({ error: "Kanalas nerastas" }, { status: 404 });
  await prisma.channel.delete({ where: { id } });
  await logAdmin(admin, "Ištrintas visam laikui", `${ch.displayName} (${ch.platform})`);
  return NextResponse.json({ ok: true });
}
