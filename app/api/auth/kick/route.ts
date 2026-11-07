import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/auth/kick -> nukreipia į Kick prisijungimo langą (OAuth su PKCE)
export async function GET(req: Request) {
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  const clientId = process.env.KICK_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Trūksta KICK_CLIENT_ID" }, { status: 500 });

  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const url = new URL("https://id.kick.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback/kick`);
  url.searchParams.set("scope", "user:read");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  res.cookies.set("oauth_state", state, opts);
  res.cookies.set("oauth_verifier", verifier, opts);
  return res;
}
