import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/auth/twitch -> nukreipia į Twitch prisijungimo langą
export async function GET(req: Request) {
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Trūksta TWITCH_CLIENT_ID" }, { status: 500 });

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback/twitch`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ""); // neprašome jokių papildomų leidimų
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return res;
}
