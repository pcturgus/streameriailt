import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { finishLogin } from "@/lib/login";

export const dynamic = "force-dynamic";

async function appToken(): Promise<string | null> {
  const r = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.KICK_CLIENT_ID!,
      client_secret: process.env.KICK_CLIENT_SECRET!,
    }),
  });
  return r.ok ? ((await r.json()) as { access_token: string }).access_token : null;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const origin = process.env.APP_URL ?? u.origin;
  const fail = () => NextResponse.redirect(`${origin}/?login=error`);

  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const jar = await cookies();
  const saved = jar.get("oauth_state")?.value;
  const verifier = jar.get("oauth_verifier")?.value;
  if (!code || !state || !saved || !verifier || state !== saved) return fail();
  jar.delete("oauth_state");
  jar.delete("oauth_verifier");

  const tokenRes = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KICK_CLIENT_ID!,
      client_secret: process.env.KICK_CLIENT_SECRET!,
      code,
      redirect_uri: `${origin}/api/auth/callback/kick`,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) return fail();
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://api.kick.com/public/v1/users", {
    headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" },
  });
  if (!meRes.ok) return fail();
  const me = ((await meRes.json()) as { data?: any[] }).data?.[0];
  const id = me?.user_id;
  if (id === undefined || id === null) return fail();

  const name: string = String(me.name ?? `kick-${id}`);
  const avatar: string | null = me.profile_picture ?? null;

  // Tikslus kanalo "slug" (adresas) – iš viešos API; jei nepavyksta, darome iš vardo
  let slug = name.toLowerCase().replace(/_/g, "-");
  try {
    const t = await appToken();
    if (t) {
      const r = await fetch(`https://api.kick.com/public/v1/channels?broadcaster_user_id=${id}`, {
        headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
      });
      const s = r.ok ? ((await r.json()) as { data?: { slug?: string }[] }).data?.[0]?.slug : null;
      if (s) slug = s;
    }
  } catch {
    /* paliekame išvestą slug */
  }

  await finishLogin({
    provider: "kick",
    accountId: String(id),
    displayName: name,
    avatarUrl: avatar,
    channel: { platform: "KICK", platformId: String(id), login: slug, url: `https://kick.com/${slug}` },
  });
  return NextResponse.redirect(`${origin}/?login=ok`);
}
