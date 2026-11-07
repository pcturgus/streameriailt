import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type TwUser = { id: string; login: string; display_name: string; profile_image_url: string };

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

  const id = process.env.TWITCH_CLIENT_ID!;
  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${origin}/api/auth/callback/twitch`,
    }),
  });
  if (!tokenRes.ok) return fail();
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: { Authorization: `Bearer ${access_token}`, "Client-Id": id },
  });
  if (!meRes.ok) return fail();
  const tu = ((await meRes.json()) as { data: TwUser[] }).data?.[0];
  if (!tu) return fail();

  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "twitch", providerAccountId: tu.id } },
    include: { user: true },
  });
  const user = account
    ? await prisma.user.update({
        where: { id: account.userId },
        data: { displayName: tu.display_name, avatarUrl: tu.profile_image_url },
      })
    : await prisma.user.create({
        data: {
          displayName: tu.display_name,
          avatarUrl: tu.profile_image_url,
          accounts: { create: { provider: "twitch", providerAccountId: tu.id } },
        },
      });

  // Prisijungimas įrodo, kad žmogus valdo šį Twitch kanalą. Naujas kanalas laukia patvirtinimo (PENDING).
  const url = `https://twitch.tv/${tu.login}`;
  await prisma.channel.upsert({
    where: { platform_platformId: { platform: "TWITCH", platformId: tu.id } },
    update: { ownerId: user.id, verified: true, login: tu.login, displayName: tu.display_name, avatarUrl: tu.profile_image_url, url },
    create: {
      platform: "TWITCH", platformId: tu.id, login: tu.login, displayName: tu.display_name,
      avatarUrl: tu.profile_image_url, url, language: "lt", status: "PENDING", verified: true, ownerId: user.id,
    },
  });

  await setSession(user.id);
  return NextResponse.redirect(`${origin}/?login=ok`);
}
