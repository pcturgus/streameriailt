import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logAdmin } from "@/lib/adminlog";

export const dynamic = "force-dynamic";

// PATCH /api/admin/clips/:id { hidden: boolean } -> paslepia / vėl rodo klipą
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { hidden?: boolean } | null;
  if (typeof body?.hidden !== "boolean") return NextResponse.json({ error: "Neteisingi duomenys" }, { status: 400 });
  try {
    const clip = await prisma.clip.update({ where: { id }, data: { hidden: body.hidden }, select: { title: true } });
    await logAdmin(admin, body.hidden ? "Paslėptas klipas" : "Klipas vėl rodomas", clip.title);
  } catch {
    return NextResponse.json({ error: "Klipas nerastas" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
