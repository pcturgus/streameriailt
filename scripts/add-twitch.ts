import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();
const ID = process.env.TWITCH_CLIENT_ID;
const SECRET = process.env.TWITCH_CLIENT_SECRET;
if (!ID || !SECRET) {
  console.error("Trūksta TWITCH_CLIENT_ID arba TWITCH_CLIENT_SECRET faile .env");
  process.exit(1);
}

type TwUser = { id: string; login: string; display_name: string; profile_image_url: string };

function loginOf(input: string): string {
  const m = input.trim().match(/twitch\.tv\/([\w]+)/i);
  return (m ? m[1] : input.trim().replace(/^@/, "")).toLowerCase();
}

async function main() {
  const logins = process.argv.slice(2).map(loginOf).filter(Boolean);
  if (!logins.length) {
    console.log('Naudojimas: npm run add:twitch -- kanalo_vardas "https://twitch.tv/kitas_kanalas"');
    return;
  }

  const t = (await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ID!, client_secret: SECRET!, grant_type: "client_credentials" }),
  }).then((r) => r.json())) as { access_token: string };

  const q = logins.map((l) => `login=${l}`).join("&");
  const res = (await fetch(`https://api.twitch.tv/helix/users?${q}`, {
    headers: { Authorization: `Bearer ${t.access_token}`, "Client-Id": ID! },
  }).then((r) => r.json())) as { data?: TwUser[] };

  const found = res.data ?? [];
  for (const u of found) {
    const ch = await prisma.channel.upsert({
      where: { platform_platformId: { platform: "TWITCH", platformId: u.id } },
      update: { login: u.login, displayName: u.display_name, avatarUrl: u.profile_image_url, url: `https://twitch.tv/${u.login}` },
      create: {
        platform: "TWITCH", platformId: u.id, login: u.login, displayName: u.display_name,
        avatarUrl: u.profile_image_url, url: `https://twitch.tv/${u.login}`, language: "lt", status: "APPROVED",
      },
    });
    console.log(`Pridėta: ${ch.displayName} (${ch.url})`);
  }
  for (const l of logins) {
    if (!found.some((u) => u.login === l)) console.error("Nerasta Twitch kanalo:", l);
  }
  await prisma.$disconnect();
}
main();
