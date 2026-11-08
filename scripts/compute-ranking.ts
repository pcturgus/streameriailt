import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile();
} catch {
  /* .env nerastas */
}

const prisma = new PrismaClient();

// ===== Reitingo taisyklės (viską galima keisti čia) =====
const PERIOD = "30d"; // vienas nuolat perskaičiuojamas reitingas
const WINDOW_DAYS = 30; // slenkantis langas
const MIN_DAYS = 2; // mažiausiai aktyvių dienų (kai istorijos bus daugiau, didinti iki 3)
const MIN_HOURS = 2; // mažiausiai transliuotų valandų per langą (vėliau didinti iki 5)
const MIN_DAY_HOURS = 0.5; // diena laikoma aktyvia nuo 30 min.
const DAY_HOURS_CAP = 12; // daugiau nei 12 val. per dieną neskaičiuojame (apsauga nuo 24/7 srautų)
const LEGACY_DAY_HOURS = 1; // senoms dienoms, kai valandos dar nebuvo skaičiuojamos
const TARGET_HOURS_PER_DAY = 3; // vidutiniškai tiek valandų per dieną = pilni nuoseklumo taškai
const W = { audience: 0.7, consistency: 0.3 }; // kilimas (trend) bus pridėtas vėliau

async function compute() {
  const now = new Date();
  const day = (o: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + o));
  const from = day(-(WINDOW_DAYS - 1));

  // Jei istorijos dar mažiau nei 30 dienų, nuoseklumą lyginame su tikrai turimu laikotarpiu
  const earliest = await prisma.channelStat.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  const historyDays = earliest ? Math.floor((day(0).getTime() - earliest.date.getTime()) / 86_400_000) + 1 : 1;
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

  const rows = [...byChannel.entries()]
    .map(([channelId, list]) => {
      const days = list
        .filter((s) => s.avgViewers > 0 || s.peakViewers > 0 || s.hoursStreamed > 0)
        .map((s) => ({ avg: s.avgViewers, h: s.hoursStreamed > 0 ? Math.min(s.hoursStreamed, DAY_HOURS_CAP) : LEGACY_DAY_HOURS }));
      const activeDays = days.filter((d) => d.h >= MIN_DAY_HOURS).length;
      const hours = days.reduce((a, d) => a + d.h, 0);
      if (activeDays < MIN_DAYS || hours < MIN_HOURS) return null;

      const avg = days.reduce((a, d) => a + d.avg * d.h, 0) / hours; // vidurkis, pasverstas transliacijos valandomis
      const consistency =
        0.5 * Math.min(1, activeDays / windowDays) + 0.5 * Math.min(1, hours / (windowDays * TARGET_HOURS_PER_DAY));
      const first = list[0].followers;
      const last = list[list.length - 1].followers;
      const growthPct = first > 0 ? ((last - first) / first) * 100 : 0;
      return { channelId, avg, hours, consistency, growthPct };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) {
    console.log("Reitingui kol kas nepakanka duomenų (nė vienas kanalas neatitinka minimalių reikalavimų).");
    return;
  }

  const maxAvg = Math.sqrt(Math.max(...rows.map((r) => r.avg)));
  const ranked = rows
    .map((r) => ({
      ...r,
      score: 100 * (W.audience * (maxAvg ? Math.sqrt(r.avg) / maxAvg : 0) + W.consistency * r.consistency),
    }))
    .sort((a, b) => b.score - a.score || b.hours - a.hours); // lygybės atveju pirmas tas, kas daugiau transliavo

  await prisma.$transaction([
    prisma.ranking.deleteMany({}),
    prisma.ranking.createMany({
      data: ranked.map((r, i) => ({
        channelId: r.channelId,
        period: PERIOD,
        rank: i + 1,
        score: Math.round(r.score * 10) / 10,
        growthPct: Math.round(r.growthPct * 10) / 10,
        avgViewers: Math.round(r.avg),
        hours: Math.round(r.hours * 10) / 10,
      })),
    }),
  ]);

  console.log(`[${new Date().toLocaleTimeString("lt-LT")}] Reitingas (${WINDOW_DAYS} d.): ${ranked.length} kanalų`);
}

async function run() {
  try {
    await compute();
  } catch (e) {
    console.error("Reitingo skaičiavimo klaida:", e);
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
