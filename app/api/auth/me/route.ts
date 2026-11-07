import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ user: await currentUser() });
  } catch {
    return NextResponse.json({ user: null });
  }
}
