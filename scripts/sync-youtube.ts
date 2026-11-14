import { prisma, yt, quotaUsed } from "../lib/youtube";

// YouTube kategorijos ID -> [mūsų kategorija, rodomas pavadinimas]
const CAT: Record<string, [string, string]> = {
  "20": ["gaming", "Žaidimai"],
  "10": ["irl", "Muzika"],
  "22": ["irl", "Pokalbiai / IRL"],
  "24": ["irl", "Pramogos"],
  "28": ["tech", "Mokslas ir technologijos"],
  "17": ["irl", "Sportas"],
};

// Transliacijos valandų skaičiavimas: pridedame laiką nuo praėjusio patikrinimo, jei kanalas jau buvo gyvas.
// Jei tarpas per ilgas (workeris praleido paleidimus) arba tai pirmas pastebėjimas, skiriame nedidelį kreditą.
const GAP_CAP_MS = 20 * 60_000;
const FIRST_SEEN_CREDIT_H = 5 / 60;
function hoursSince(prev: { isLive: boolean; updatedAt: Date } | null, nowMs: number): number {
  if (prev?.isLive) {
    const d = nowMs - prev.updatedAt.getTime();
    if (d >= 0 && d <= GAP_CAP_MS) return d / 3_600_000;
  }
  return FIRST_SEEN_CREDIT_H;
}

async function sync() {
  const t0 = Date.now();
  const q0 = quotaUsed;

  const channels = await prisma.channel.findMany({
    where: { platform: "YOUTUBE", status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
  });

  // 1) Naujausi kiekvieno kanalo vaizdo įrašai (gyva transliacija patenka į "uploads" sąrašą)
  const videoIds = new Set<string>();
  for (const c of channels) {
    try {
      const r = await yt("playlistItems", {
        part: "contentDetails",
        playlistId: "UU" + c.platformId.slice(2),
        maxResults: "5",
      });
      for (const it of r.items ?? []) videoIds.add(it.contentDetails.videoId);
    } catch (e) {
      console.error(`  ! ${c.displayName}:`, (e as Error).message.slice(0, 160));
    }
  }

  // 2) Kurie iš jų dabar transliuojami (po 50 vienai užklausai)
  const live = new Map<string, { v: any; viewers: number }>();
  const ids = [...videoIds];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt("videos", { part: "snippet,liveStreamingDetails", id: ids.slice(i, i + 50).join(",") });
    for (const v of r.items ?? []) {
      const d = v.liveStreamingDetails;
      if (d?.actualStartTime && !d.actualEndTime) {
        const viewers = Number(d.concurrentViewers ?? 0);
        const prev = live.get(v.snippet.channelId);
        if (!prev || viewers > prev.viewers) live.set(v.snippet.channelId, { v, viewers });
      }
    }
  }

  // 3) Sekėjai ir avataras (atnaujinama kas kartą, 1 vienetas 50 kanalų)
  const info = new Map<string, { followers: number; avatar: string | null }>();
  const cids = channels.map((c) => c.platformId);
  for (let i = 0; i < cids.length; i += 50) {
    const r = await yt("channels", { part: "snippet,statistics", id: cids.slice(i, i + 50).join(",") });
    for (const c of r.items ?? []) {
      info.set(c.id, {
        followers: Number(c.statistics?.subscriberCount ?? 0),
        avatar: c.snippet.thumbnails?.default?.url ?? null,
      });
    }
  }

  const today = new Date(new Date().toISOString().slice(0, 10));
  for (const c of channels) {
    const i = info.get(c.platformId);
    const ch = i
      ? await prisma.channel.update({ where: { id: c.id }, data: { followers: i.followers, avatarUrl: i.avatar } })
      : c;

    const hit = live.get(c.platformId);
    if (!hit) continue;
    const { v, viewers } = hit;
    const [category, game] = CAT[v.snippet.categoryId] ?? ["irl", "Tiesioginė transliacija"];
    const data = {
      isLive: true,
      title: v.snippet.title,
      game,
      category,
      viewers,
      thumbnailUrl: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url ?? null,
      tags: (v.snippet.tags ?? []).slice(0, 3),
      startedAt: new Date(v.liveStreamingDetails.actualStartTime),
    };
    const prevLive = await prisma.liveStream.findUnique({ where: { channelId: ch.id }, select: { isLive: true, updatedAt: true } });
    const addHours = hoursSince(prevLive, Date.now());
    await prisma.liveStream.upsert({ where: { channelId: ch.id }, update: data, create: { channelId: ch.id, ...data } });

    const key = { channelId_date: { channelId: ch.id, date: today } };
    const prev = await prisma.channelStat.findUnique({ where: key });
    await prisma.channelStat.upsert({
      where: key,
      update: {
        followers: ch.followers,
        peakViewers: Math.max(prev?.peakViewers ?? 0, viewers),
        hoursStreamed: { increment: addHours },
        avgViewers: Math.round((prev?.avgViewers ?? viewers) * 0.9 + viewers * 0.1),
      },
      create: { channelId: ch.id, date: today, followers: ch.followers, avgViewers: viewers, peakViewers: viewers, hoursStreamed: addHours },
    });
  }

  // Likusius (įskaitant demonstracinius) pažymime kaip neaktyvius
  const off = await prisma.liveStream.updateMany({
    where: { isLive: true, channel: { platform: "YOUTUBE", platformId: { notIn: [...live.keys()] } } },
    data: { isLive: false, viewers: 0 },
  });

  console.log(
    `[${new Date().toLocaleTimeString("lt-LT")}] YouTube: kanalų ${channels.length}, gyvai ${live.size}, baigė ${off.count}, kvota ~${quotaUsed - q0}, ${((Date.now() - t0) / 1000).toFixed(1)} s`
  );
}

async function run() {
  try {
    await sync();
  } catch (e) {
    console.error("Sinchronizacijos klaida:", e);
    process.exitCode = 1; // GitHub darbas pažymimas kaip nepavykęs
  }
}

async function main() {
  if (process.argv.includes("--loop")) {
    await run();
    setInterval(run, 5 * 60_000); // kas 5 min., kad tilptume į dienos kvotą
  } else {
    await run();
    await prisma.$disconnect();
  }
}
main();
