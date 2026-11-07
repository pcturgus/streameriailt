import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// PATCH /api/admin/clips/:id { hidden: boolean } -> paslepia / vėl rodo klipą
// (slepiame, o ne triname, kad kitas importas jo negrąžintų)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { hidden?: boolean } | null;
  if (typeof body?.hidden !== "boolean") return NextResponse.json({ error: "Neteisingi duomenys" }, { status: 400 });
  try {
    await prisma.clip.update({ where: { id }, data: { hidden: body.hidden } });
  } catch {
    return NextResponse.json({ error: "Klipas nerastas" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
