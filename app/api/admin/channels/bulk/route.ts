import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { requireAdmin } from "@/lib/session";
import { logAdmin } from "@/lib/adminlog";
import { addChannelAdmin, type AddResult } from "@/lib/adminops";

export const dynamic = "force-dynamic";

const MAX_LINES = 25;

// POST /api/admin/channels/bulk { text, platform? } – pridedami keli kanalai iš karto (po vieną eilutėje)
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { text?: string; platform?: string } | null;
  const lines = (body?.text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return NextResponse.json({ error: "Įveskite bent vieną nuorodą" }, { status: 400 });
  if (lines.length > MAX_LINES) {
    return NextResponse.json({ error: `Vienu kartu daugiausia ${MAX_LINES} eilučių (įvedėte ${lines.length})` }, { status: 400 });
  }
  const fallback = body?.platform && body.platform in Platform ? (body.platform as Platform) : null;

  const results: AddResult[] = [];
  for (let i = 0; i < lines.length; i += 5) {
    results.push(...(await Promise.all(lines.slice(i, i + 5).map((l) => addChannelAdmin(l, fallback)))));
  }
  const ok = results.filter((r) => r.ok);
  await logAdmin(admin, "Pridėti kanalai", `${ok.length} iš ${results.length}: ${ok.slice(0, 5).map((r) => r.name).join(", ")}`);
  return NextResponse.json({ results });
}
