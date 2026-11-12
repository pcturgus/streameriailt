import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/favorites -> prisijungusio vartotojo mėgstamų kanalų ID
export async function GET() {
  let user = null;
  try {
    user = await currentUser();
  } catch {
    /* sesija neįjungta */
  }
  if (!user) return NextResponse.json({ loggedIn: false, ids: [] });
  const rows = await prisma.favorite.findMany({ where: { userId: user.id }, select: { channelId: true } });
  return NextResponse.json({ loggedIn: true, ids: rows.map((r) => r.channelId) });
}

// POST /api/favorites { channelId } -> įtraukia arba pašalina iš mėgstamų
export async function POST(req: Request) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Reikia prisijungti" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { channelId?: string } | null;
  const channelId = body?.channelId;
  if (!channelId) return NextResponse.json({ error: "Neteisingi duomenys" }, { status: 400 });

  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
  if (!channel) return NextResponse.json({ error: "Kanalas nerastas" }, { status: 404 });

  const key = { userId_channelId: { userId: user.id, channelId } };
  const existing = await prisma.favorite.findUnique({ where: key });
  if (existing) {
    await prisma.favorite.delete({ where: key });
    return NextResponse.json({ favorite: false });
  }
  await prisma.favorite.create({ data: { userId: user.id, channelId } });
  return NextResponse.json({ favorite: true });
}
