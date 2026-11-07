import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/auth/google -> nukreipia į Google (YouTube) prisijungimo langą
export async function GET(req: Request) {
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Trūksta GOOGLE_CLIENT_ID" }, { status: 500 });

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback/google`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile https://www.googleapis.com/auth/youtube.readonly");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return res;
}
