import { PrismaClient, Platform } from "@prisma/client";

const prisma = new PrismaClient();

// [login, vardas, platforma, žaidimas, pavadinimas, kategorija, žiūrovai, sekėjai, tagai]
const data: [string, string, Platform, string, string, string, number, number, string[]][] = [
  ["lithuanianpro", "LithuanianPro", "KICK", "Counter-Strike 2", "CS2 FACEIT Level 10 Grind | Baltijos šalių turnyro kvalifikacija", "esports", 1420, 89200, ["Esports", "Lietuviškai", "Pro"]],
  ["simona_live", "Simona_Live", "KICK", "Pokalbiai / Muzika", "Just Chatting & Akustiniai vakaro kūriniai", "irl", 890, 65100, ["Muzika", "IRL", "Pokalbiai"]],
  ["gameris_lt", "Gameris_LT", "TWITCH", "GTA V RP", "GTA V RP | Vilnius City Serveris - LSPD Policijos patrulis", "gaming", 2150, 124500, ["Roleplay", "GTA5", "LT"]],
  ["techlt_vids", "TechLT_Vids", "YOUTUBE", "Mokslas ir Technologijos", "Ar verta pirkti RTX 5090? Kompiuterio rinkimas gyvai & Q&A", "tech", 430, 110000, ["Technologijos", "Hardware", "Apžvalga"]],
  ["tomas_valorant", "Tomas_Valorant", "TWITCH", "Valorant", "VALORANT Radiant Rank Grind | EU West Serveryje su Pro Žaidėjais", "gaming", 670, 45800, ["FPS", "Ranked", "Radiant"]],
  ["ruta_gamer", "Rūta_Gamer", "YOUTUBE", "Minecraft", "Minecraft Lietuva Survival S3 - Statome Bendruomenės Miestą", "gaming", 320, 12400, ["Survival", "Statybos", "Chill"]],
];

const base: Record<Platform, string> = {
  TWITCH: "https://twitch.tv/",
  KICK: "https://kick.com/",
  YOUTUBE: "https://youtube.com/@",
};

// reitingas: login -> [taškai, augimas %]
const ranks: Record<string, [number, number]> = {
  gameris_lt: [98.5, 12.4],
  lithuanianpro: [94.2, 8.1],
  simona_live: [89.7, 15.8],
  techlt_vids: [82.1, 4.3],
  tomas_valorant: [79.4, 6.7],
};

const clips = [
  ["lithuanianpro", "Neįtikėtinas 1v5 Ace CS2 Baltijos šalių kvalifikacijoje", 14280, 840, 45],
  ["gameris_lt", "GTA RP: Netikėtas gaudynių epizodas LSPD patrulyje", 22810, 1420, 72],
  ["simona_live", "Akustinė dainos versija tiesioginiame eteryje", 9540, 610, 55],
] as const;

async function main() {
  const today = new Date();
  const period = today.toISOString().slice(0, 7);
  const day = new Date(today.toISOString().slice(0, 10));

  const ids: Record<string, string> = {};
  for (const [login, name, platform, game, title, category, viewers, followers, tags] of data) {
    const ch = await prisma.channel.upsert({
      where: { platform_platformId: { platform, platformId: "seed-" + login } },
      update: { followers },
      create: {
        platform, platformId: "seed-" + login, login, displayName: name,
        url: base[platform] + login, verified: platform !== "YOUTUBE",
        status: "APPROVED", followers,
      },
    });
    ids[login] = ch.id;

    await prisma.liveStream.upsert({
      where: { channelId: ch.id },
      update: { viewers, isLive: true },
      create: { channelId: ch.id, isLive: true, title, game, category, viewers, tags, startedAt: new Date() },
    });

    await prisma.channelStat.upsert({
      where: { channelId_date: { channelId: ch.id, date: day } },
      update: {},
      create: { channelId: ch.id, date: day, followers, avgViewers: Math.round(viewers * 0.9), peakViewers: viewers },
    });
  }

  let rank = 1;
  for (const [login, [score, growthPct]] of Object.entries(ranks).sort((a, b) => b[1][0] - a[1][0])) {
    await prisma.ranking.upsert({
      where: { channelId_period: { channelId: ids[login], period } },
      update: { rank, score, growthPct },
      create: { channelId: ids[login], period, rank, score, growthPct },
    });
    rank++;
  }

  for (const [login, title, views, likes, durationSec] of clips) {
    await prisma.clip.upsert({
      where: { platform_platformId: { platform: data.find((d) => d[0] === login)![2], platformId: "seed-clip-" + login } },
      update: { views, likes },
      create: {
        platform: data.find((d) => d[0] === login)![2], platformId: "seed-clip-" + login,
        channelId: ids[login], title, views, likes, durationSec,
      },
    });
  }
  console.log("Seed baigtas");
}

main().finally(() => prisma.$disconnect());
