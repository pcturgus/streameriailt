import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();

// ===== Reitingo taisyklės (viską galima keisti čia) =====
const PERIOD = "30d"; // pagrindinis reitingas (slenkantis langas)
const RISING = "rising"; // „Kylančių“ sąrašas
const WINDOW_DAYS = 30;
const MIN_DAYS = 2; // mažiausiai aktyvių dienų (kai istorijos bus daugiau, didinti iki 3)
const MIN_HOURS = 2; // mažiausiai transliuotų valandų per langą (vėliau didinti iki 5)
const MIN_DAY_HOURS = 0.5; // diena laikoma aktyvia nuo 30 min.
const DAY_HOURS_CAP = 12; // daugiau nei 12 val. per dieną neskaičiuojame
const LEGACY_DAY_HOURS = 1; // senoms dienoms, kai valandos dar nebuvo skaičiuojamos
const TARGET_HOURS_PER_DAY = 3; // vidutiniškai tiek val. per dieną = pilni nuoseklumo taškai
const W = { audience: 0.7, consistency: 0.3 };

// Augimas ir „Kylančios“: paskutinės 7 dienos lyginamos su ankstesnėmis 7
const TREND_DAYS = 7;
const MIN_TREND_HOURS = 1; // kiekviename 7 d. laikotarpyje bent tiek val.
const RISING_MIN_AVG = 5; // ignoruojame kanalus, kurių vidurkis mažesnis (per didelis triukšmas)
const RISING_SMOOTH = 20; // „suminkština“ labai mažų kanalų šuolius (2 -> 6 žiūrovai nėra +200 % žvaigždė)
const RISING_LIMIT = 50;

// Vietos pokytis lyginamas su reitingu prieš savaitę
const MOVEMENT_DAYS = 7;
const HISTORY_KEEP_DAYS = 60;

type Entry = { date: Date; avg: number; h: number };
type Row = {
  channelId: string; avg: number; hours: number; consistency: number;
  growthPct: number | null; recentAvg: number | null; prevAvg: number | null; recentHours: number;
};

const agg = (arr: Entry[]) => {
  const h = arr.reduce((a, e) => a + e.h, 0);
  return h > 0 ? { avg: arr.reduce((a, e) => a + e.avg * e.h, 0) / h, hours: h } : null;
};

async function compute() {
  const now = new Date();
  const day = (o: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + o));
  const today = day(0);
  const from = day(-(WINDOW_DAYS - 1));
  const trendFrom = day(-(TREND_DAYS - 1));
  const prevFrom = day(-(2 * TREND_DAYS - 1));

  const earliest = await prisma.channelStat.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  const historyDays = earliest ? Math.floor((today.getTime() - earliest.date.getTime()) / 86_400_000) + 1 : 1;
  const windowDays = Math.max(1, Math.min(WINDOW_DAYS, historyDays));

  const stats = await prisma.channelStat.findMany({
    where: {
      date: { gte: from },
      channel: { status: "APPROVED", NOT: { platformId: { startsWith: "seed-" } } },
    },
    orderBy: { date: "asc" },
  });

  const byChannel = new Map<string, typeof stats>();
  for (const s of stats) {
    if (!byChannel.has(s.channelId)) byChannel.set(s.channelId, []);
    byChannel.get(s.channelId)!.push(s);
  }

  const rows: Row[] = [];
  for (const [channelId, list] of byChannel) {
    const entries: Entry[] = list
      .filter((s) => s.avgViewers > 0 || s.peakViewers > 0 || s.hoursStreamed > 0)
      .map((s) => ({
        date: s.date,
        avg: s.avgViewers,
        h: s.hoursStreamed > 0 ? Math.min(s.hoursStreamed, DAY_HOURS_CAP) : LEGACY_DAY_HOURS,
      }));
    const activeDays = entries.filter((e) => e.h >= MIN_DAY_HOURS).length;
    const total = agg(entries);
    if (!total || activeDays < MIN_DAYS || total.hours < MIN_HOURS) continue;

    const consistency =
      0.5 * Math.min(1, activeDays / windowDays) + 0.5 * Math.min(1, total.hours / (windowDays * TARGET_HOURS_PER_DAY));

    const recent = agg(entries.filter((e) => e.date >= trendFrom));
    const prev = agg(entries.filter((e) => e.date >= prevFrom && e.date < trendFrom));
    const trendOk = !!recent && !!prev && recent.hours >= MIN_TREND_HOURS && prev.hours >= MIN_TREND_HOURS && prev.avg > 0;

    rows.push({
      channelId, avg: total.avg, hours: total.hours, consistency,
      growthPct: trendOk ? ((recent!.avg - prev!.avg) / prev!.avg) * 100 : null,
      recentAvg: trendOk ? recent!.avg : null,
      prevAvg: trendOk ? prev!.avg : null,
      recentHours: recent?.hours ?? 0,
    });
  }

  if (!rows.length) {
    console.log("Reitingui kol kas nepakanka duomenų (nė vienas kanalas neatitinka minimalių reikalavimų).");
    return;
  }

  // ----- pagrindinis reitingas -----
  const maxAvg = Math.sqrt(Math.max(...rows.map((r) => r.avg)));
  const ranked = rows
    .map((r) => {
      const partAudience = 100 * W.audience * (maxAvg ? Math.sqrt(r.avg) / maxAvg : 0);
      const partConsistency = 100 * W.consistency * r.consistency;
      return { ...r, partAudience, partConsistency, score: partAudience + partConsistency };
    })
    .sort((a, b) => b.score - a.score || b.hours - a.hours);

  // ----- vietos pokytis prieš savaitę -----
  const baseDate = await prisma.rankingHistory.findFirst({
    where: { date: { lte: day(-MOVEMENT_DAYS) } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const base = baseDate
    ? new Map((await prisma.rankingHistory.findMany({ where: { date: baseDate.date } })).map((h) => [h.channelId, h.rank]))
    : null;

  // ----- „Kylančios“ -----
  const rising = rows
    .filter((r) => r.growthPct !== null && r.growthPct > 0 && r.recentAvg! >= RISING_MIN_AVG && r.prevAvg! >= RISING_MIN_AVG)
    .map((r) => ({ ...r, index: (r.recentAvg! - r.prevAvg!) / (r.prevAvg! + RISING_SMOOTH) }))
    .sort((a, b) => b.index - a.index)
    .slice(0, RISING_LIMIT);

  const r1 = (n: number) => Math.round(n * 10) / 10;

  await prisma.$transaction([
    prisma.ranking.deleteMany({}),
    prisma.ranking.createMany({
      data: [
        ...ranked.map((r, i) => ({
          channelId: r.channelId, period: PERIOD, rank: i + 1,
          score: r1(r.score), partAudience: r1(r.partAudience), partConsistency: r1(r.partConsistency),
          growthPct: r.growthPct === null ? null : r1(r.growthPct),
          avgViewers: Math.round(r.avg), hours: r1(r.hours),
          prevRank: base?.get(r.channelId) ?? null,
          isNew: !!base && !base.has(r.channelId),
        })),
        ...rising.map((r, i) => ({
          channelId: r.channelId, period: RISING, rank: i + 1,
          score: r1(r.index * 100), growthPct: r1(r.growthPct!),
          avgViewers: Math.round(r.recentAvg!), prevAvgViewers: Math.round(r.prevAvg!), hours: r1(r.recentHours),
        })),
      ],
    }),
    // šiandienos nuotrauka ir senų valymas
    prisma.rankingHistory.deleteMany({ where: { OR: [{ date: today }, { date: { lt: day(-HISTORY_KEEP_DAYS) } }] } }),
    prisma.rankingHistory.createMany({ data: ranked.map((r, i) => ({ date: today, channelId: r.channelId, rank: i + 1 })) }),
  ]);

  console.log(
    `[${new Date().toLocaleTimeString("lt-LT")}] Reitingas (${WINDOW_DAYS} d.): ${ranked.length} kanalų, kylančių: ${rising.length}, palyginimas su praeita savaite: ${base ? "yra" : "dar nėra istorijos"}`
  );
}

async function run() {
  try {
    await compute();
  } catch (e) {
    console.error("Reitingo skaičiavimo klaida:", e);
    process.exitCode = 1; // GitHub darbas pažymimas kaip nepavykęs
  }
}

async function main() {
  if (process.argv.includes("--loop")) {
    await run();
    setInterval(run, 60 * 60_000);
  } else {
    await run();
    await prisma.$disconnect();
  }
}
main();
