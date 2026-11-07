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

type TwClip = {
  id: string;
  embed_url: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
};

let token = "";
let tokenExp = 0;

async function getToken(): Promise<string> {
  if (token && Date.now() < tokenExp) return token;
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ID!, client_secret: SECRET!, grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`Twitch token klaida ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = j.access_token;
  tokenExp = Date.now() + (j.expires_in - 300) * 1000;
  return token;
}

async function sync() {
  const t0 = Date.now();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const channels = await prisma.channel.findMany({
    where: { platform: "TWITCH", status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
  });

  let saved = 0;
  for (const c of channels) {
    try {
      const r = await fetch(
        `https://api.twitch.tv/helix/clips?broadcaster_id=${c.platformId}&started_at=${since}&first=10`,
        { headers: { Authorization: `Bearer ${await getToken()}`, "Client-Id": ID! } }
      );
      if (!r.ok) {
        if (r.status === 401) tokenExp = 0;
        console.error(`  ! ${c.displayName}: Twitch ${r.status}`);
        continue;
      }
      const { data } = (await r.json()) as { data: TwClip[] };
      for (const k of data) {
        const fields = {
          title: k.title,
          thumbnailUrl: k.thumbnail_url,
          embedUrl: k.embed_url,
          durationSec: Math.round(k.duration),
          views: k.view_count,
          createdAt: new Date(k.created_at),
        };
        await prisma.clip.upsert({
          where: { platform_platformId: { platform: "TWITCH", platformId: k.id } },
          update: fields,
          create: { platform: "TWITCH", platformId: k.id, channelId: c.id, ...fields },
        });
        saved++;
      }
    } catch (e) {
      console.error(`  ! ${c.displayName}:`, (e as Error).message.slice(0, 160));
    }
  }

  // Pašaliname demonstracinius ir senesnius nei 14 dienų klipus
  const old = await prisma.clip.deleteMany({
    where: {
      OR: [
        { platformId: { startsWith: "seed-" } },
        { createdAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  console.log(
    `[${new Date().toLocaleTimeString("lt-LT")}] Klipai: kanalų ${channels.length}, įrašyta ${saved}, pašalinta ${old.count}, ${((Date.now() - t0) / 1000).toFixed(1)} s`
  );
}

async function run() {
  try {
    await sync();
  } catch (e) {
    console.error("Klipų sinchronizacijos klaida:", e);
  }
}

async function main() {
  if (process.argv.includes("--loop")) {
    await run();
    setInterval(run, 30 * 60_000);
  } else {
    await run();
    await prisma.$disconnect();
  }
}
main();
