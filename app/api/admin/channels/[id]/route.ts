import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

// PATCH /api/admin/channels/:id  { action: remove | block | restore | verify | unverify }
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;

  const actions: Record<string, object> = {
    remove: { status: "EXPIRED" },
    block: { status: "REJECTED" },
    restore: { status: "APPROVED", activatedAt: new Date() },
    verify: { verified: true },
    unverify: { verified: false },
  };
  const data = body?.action ? actions[body.action] : undefined;
  if (!data) return NextResponse.json({ error: "Nežinomas veiksmas" }, { status: 400 });

  try {
    await prisma.channel.update({ where: { id }, data });
    if (body?.action === "remove" || body?.action === "block") {
      await prisma.liveStream.updateMany({ where: { channelId: id }, data: { isLive: false, viewers: 0 } });
    }
  } catch {
    return NextResponse.json({ error: "Kanalas nerastas" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/channels/:id -> ištrina kanalą ir visą jo istoriją visam laikui
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await requireAdmin())) return forbidden();
  const { id } = await params;
  try {
    await prisma.channel.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Kanalas nerastas" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
