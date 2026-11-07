import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Platform } from "@prisma/client";
import { finishLogin } from "@/lib/login";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const origin = process.env.APP_URL ?? u.origin;
  const fail = () => NextResponse.redirect(`${origin}/?login=error`);

  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const jar = await cookies();
  const saved = jar.get("oauth_state")?.value;
  if (!code || !state || !saved || state !== saved) return fail();
  jar.delete("oauth_state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail();
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const auth = { Authorization: `Bearer ${access_token}` };

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: auth });
  if (!infoRes.ok) return fail();
  const info = (await infoRes.json()) as { sub: string; name?: string; picture?: string };
  if (!info.sub) return fail();

  // Randame prisijungusio žmogaus YouTube kanalą (jei jis jį turi)
  let channel:
    | { platform: Platform; platformId: string; login: string; url: string; displayName: string; avatarUrl: string | null; followers: number }
    | undefined;
  try {
    const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", { headers: auth });
    const c = r.ok ? ((await r.json()) as { items?: any[] }).items?.[0] : null;
    if (c) {
      const handle: string = c.snippet?.customUrl ?? "";
      channel = {
        platform: "YOUTUBE",
        platformId: c.id,
        login: handle.replace(/^@/, "") || c.id,
        url: handle.startsWith("@") ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${c.id}`,
        displayName: c.snippet?.title ?? info.name ?? "YouTube kanalas",
        avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
        followers: Number(c.statistics?.subscriberCount ?? 0),
      };
    }
  } catch {
    /* prisijungimas vis tiek pavyksta be kanalo */
  }

  await finishLogin({
    provider: "google",
    accountId: info.sub,
    displayName: info.name ?? channel?.displayName ?? "Vartotojas",
    avatarUrl: info.picture ?? null,
    channel,
  });
  return NextResponse.redirect(`${origin}/?login=ok`);
}
