import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdmin } from "@/lib/adminlog";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  remove: "Pašalinti", block: "Užblokuoti", restore: "Aktyvuoti", verify: "Patvirtinti", unverify: "Nuimti patvirtinimą", delete: "Ištrinti",
};

// POST /api/admin/channels/bulk-action { ids: string[], action }
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { ids?: string[]; action?: string } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x) => typeof x === "string").slice(0, 100) : [];
  const action = body?.action ?? "";
  if (!ids.length || !(action in LABEL)) return NextResponse.json({ error: "Neteisingi duomenys" }, { status: 400 });

  const chans = await prisma.channel.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  const found = chans.map((c) => c.id);

  if (action === "delete") {
    await prisma.channel.deleteMany({ where: { id: { in: found } } });
  } else {
    const data =
      action === "remove" ? { status: "EXPIRED" as const }
      : action === "block" ? { status: "REJECTED" as const }
      : action === "restore" ? { status: "APPROVED" as const, activatedAt: new Date() }
      : action === "verify" ? { verified: true }
      : { verified: false };
    await prisma.channel.updateMany({ where: { id: { in: found } }, data });
    if (action === "remove" || action === "block") {
      await prisma.liveStream.updateMany({ where: { channelId: { in: found } }, data: { isLive: false, viewers: 0 } });
    }
  }

  await logAdmin(admin, `Masinis veiksmas: ${LABEL[action]}`, `${chans.length} kan.: ${chans.slice(0, 5).map((c) => c.displayName).join(", ")}`);
  return NextResponse.json({ ok: true, count: chans.length });
}
