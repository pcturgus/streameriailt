import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas – naudojami sisteminiai kintamieji */
}

const prisma = new PrismaClient();
const ID = process.env.TWITCH_CLIENT_ID;
const SECRET = process.env.TWITCH_CLIENT_SECRET;

if (!ID || !SECRET) {
  console.error("Trūksta TWITCH_CLIENT_ID arba TWITCH_CLIENT_SECRET faile .env");
  process.exit(1);
}

type TwStream = {
  user_id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  tags?: string[];
};
type TwUser = { id: string; profile_image_url: string };

let token = "";
let tokenExp = 0;

async function getToken(): Promise<string> {
  if (token && Date.now() < tokenExp) return token;
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ID!,
      client_secret: SECRET!,
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`Twitch token klaida ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = j.access_token;
  tokenExp = Date.now() + (j.expires_in - 300) * 1000;
  return token;
}

async function helix<T>(path: string): Promise<T> {
  const r = await fetch("https://api.twitch.tv/helix" + path, {
    headers: { Authorization: `Bearer ${await getToken()}`, "Client-Id": ID! },
  });
  if (!r.ok) {
    if (r.status === 401) tokenExp = 0; // kitą kartą gausime naują tokeną
    throw new Error(`Twitch API ${r.status} (${path}): ${await r.text()}`);
  }
  return (await r.json()) as T;
}

async function fetchLtStreams(): Promise<TwStream[]> {
  const all: TwStream[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const res = await helix<{ data: TwStream[]; pagination?: { cursor?: string } }>(
      `/streams?language=lt&first=100${cursor ? `&after=${cursor}` : ""}`
    );
    all.push(...res.data);
    cursor = res.pagination?.cursor ?? "";
    if (!cursor) break;
  }
  return all;
}

async function fetchAvatars(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const q = ids.slice(i, i + 100).map((id) => `id=${id}`).join("&");
    const res = await helix<{ data: TwUser[] }>(`/users?${q}`);
    for (const u of res.data) map.set(u.id, u.profile_image_url);
  }
  return map;
}

function categoryOf(game: string): string {
  const g = game.toLowerCase();
  if (["just chatting", "music", "irl", "talk shows & podcasts", "asmr", "art"].includes(g)) return "irl";
  if (g.includes("science") || g.includes("software") || g.includes("technology")) return "tech";
  if (["counter-strike", "counter-strike 2", "dota 2", "league of legends", "rainbow six siege", "valorant"].includes(g)) return "esports";
  return "gaming";
}

async function sync() {
  const started = Date.now();
  const streams = await fetchLtStreams();

  // Papildomai tikriname mūsų sąraše esančius kanalus (kad rastume ir tuos, kurių kalba nenustatyta kaip lietuvių)
  const watch = await prisma.channel.findMany({
    where: { platform: "TWITCH", status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
    select: { platformId: true },
  });
  const have = new Set(streams.map((s) => s.user_id));
  const extra = watch.map((w) => w.platformId).filter((id) => !have.has(id));
  for (let i = 0; i < extra.length; i += 100) {
    const q = extra.slice(i, i + 100).map((id) => `user_id=${id}`).join("&");
    const res = await helix<{ data: TwStream[] }>(`/streams?${q}&first=100`);
    streams.push(...res.data);
  }
  const avatars = await fetchAvatars(streams.map((s) => s.user_id));
  const today = new Date(new Date().toISOString().slice(0, 10));

  for (const s of streams) {
    const avatarUrl = avatars.get(s.user_id) ?? null;
    const url = `https://twitch.tv/${s.user_login}`;

    const ch = await prisma.channel.upsert({
      where: { platform_platformId: { platform: "TWITCH", platformId: s.user_id } },
      update: { login: s.user_login, displayName: s.user_name, avatarUrl, url },
      create: {
        platform: "TWITCH", platformId: s.user_id, login: s.user_login,
        displayName: s.user_name, avatarUrl, url, language: "lt", status: "APPROVED",
      },
    });

    const data = {
      isLive: true,
      title: s.title,
      game: s.game_name || "Nenurodyta",
      category: categoryOf(s.game_name || ""),
      viewers: s.viewer_count,
      thumbnailUrl: s.thumbnail_url.replace("{width}", "440").replace("{height}", "248"),
      tags: (s.tags ?? []).slice(0, 3),
      startedAt: new Date(s.started_at),
    };
    await prisma.liveStream.upsert({
      where: { channelId: ch.id },
      update: data,
      create: { channelId: ch.id, ...data },
    });

    const key = { channelId_date: { channelId: ch.id, date: today } };
    const prev = await prisma.channelStat.findUnique({ where: key });
    await prisma.channelStat.upsert({
      where: key,
      update: {
        peakViewers: Math.max(prev?.peakViewers ?? 0, s.viewer_count),
        avgViewers: Math.round((prev?.avgViewers ?? s.viewer_count) * 0.9 + s.viewer_count * 0.1),
      },
      create: {
        channelId: ch.id, date: today, followers: ch.followers,
        avgViewers: s.viewer_count, peakViewers: s.viewer_count,
      },
    });
  }

  // Kas nebegyvas – pažymime kaip neaktyvų (tai pašalina ir demonstracinius Twitch įrašus)
  const off = await prisma.liveStream.updateMany({
    where: {
      isLive: true,
      channel: { platform: "TWITCH", platformId: { notIn: streams.map((s) => s.user_id) } },
    },
    data: { isLive: false, viewers: 0 },
  });

  console.log(
    `[${new Date().toLocaleTimeString("lt-LT")}] Twitch: gyvai ${streams.length}, baigė transliaciją ${off.count}, ${((Date.now() - started) / 1000).toFixed(1)} s`
  );
}

async function run() {
  try {
    await sync();
  } catch (e) {
    console.error("Sinchronizacijos klaida:", e);
  }
}

async function main() {
  if (process.argv.includes("--loop")) {
    await run();
    setInterval(run, 120_000);
  } else {
    await run();
    await prisma.$disconnect();
  }
}

main();
