import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PL: Record<string, { label: string; text: string }> = {
  TWITCH: { label: "Twitch", text: "text-purple-400" },
  KICK: { label: "Kick", text: "text-emerald-400" },
  YOUTUBE: { label: "YouTube", text: "text-red-400" },
};
const fmt = (n: number) => n.toLocaleString("en-US");
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ch = await prisma.channel.findUnique({ where: { id }, select: { displayName: true, platform: true, status: true } });
  if (!ch || ch.status !== "APPROVED") return { title: "Kanalas nerastas – Streameriai.Lt" };
  return {
    title: `${ch.displayName} – Streameriai.Lt`,
    description: `${ch.displayName} (${PL[ch.platform].label}): transliacijų statistika, reitingas ir klipai Streameriai.Lt.`,
  };
}

export default async function ChannelPage({ params }: Props) {
  const { id } = await params;
  const ch = await prisma.channel.findUnique({ where: { id }, include: { live: true } });
  if (!ch || ch.status !== "APPROVED") notFound();

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const [stats, rank, rankTotal, clips] = await Promise.all([
    prisma.channelStat.findMany({ where: { channelId: id, date: { gte: from } }, orderBy: { date: "asc" } }),
    prisma.ranking.findUnique({ where: { channelId_period: { channelId: id, period: "30d" } } }),
    prisma.ranking.count({ where: { period: "30d" } }),
    prisma.clip.findMany({ where: { channelId: id, hidden: false }, orderBy: { views: "desc" }, take: 6 }),
  ]);

  // 30 dienų grafikas
  const byDay = new Map(stats.map((s) => [s.date.toISOString().slice(0, 10), s.avgViewers]));
  const bars = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(from.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString("lt-LT", { month: "short", day: "numeric" }), v: byDay.get(key) ?? 0 };
  });
  const max = Math.max(1, ...bars.map((b) => b.v));
  const hours = stats.reduce((a, s) => a + s.hoursStreamed, 0);
  const peak = stats.reduce((a, s) => Math.max(a, s.peakViewers), 0);
  const live = ch.live?.isLive ? ch.live : null;
  const pl = PL[ch.platform];

  const card = "p-4 rounded-xl bg-slate-900/60 border border-slate-800";
  return (
    <main className="min-h-screen bg-[#0B0F17] text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <a href="/" className="text-xs text-indigo-400 hover:text-indigo-300">← Streameriai.Lt</a>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-5">
          {ch.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ch.avatarUrl} alt="" referrerPolicy="no-referrer" className="w-24 h-24 rounded-2xl object-cover border border-slate-700" />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-slate-800 flex items-center justify-center text-3xl font-bold text-white">{ch.displayName[0]}</div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold text-white truncate">
              {ch.displayName} {ch.verified && <span className="text-indigo-400 text-xl align-middle" title="Patvirtintas kanalas">✓</span>}
            </h1>
            <p className={`text-sm mt-1 ${pl.text}`}>{pl.label}{ch.followers ? ` · ${fmt(ch.followers)} sekėjų` : ""}</p>
          </div>
          <a href={ch.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
            Atidaryti {pl.label}
          </a>
        </div>

        {live && (
          <div className="mt-6 p-4 rounded-xl border border-red-500/30 bg-red-500/5 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-red-300">GYVAI DABAR · {fmt(live.viewers)} žiūrovų</div>
              <div className="text-sm text-white truncate">{live.title}</div>
              <div className="text-xs text-slate-400 truncate">{live.game}</div>
            </div>
            <a href={ch.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg px-3 py-2">Žiūrėti</a>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={card}><div className="text-2xl font-bold text-white">{rank ? `#${rank.rank}` : "–"}</div><div className="text-[11px] text-slate-400 mt-0.5">Reitingo vieta{rank ? ` iš ${rankTotal}` : ""}</div></div>
          <div className={card}><div className="text-2xl font-bold text-indigo-300">{rank ? rank.score.toFixed(1) : "–"}</div><div className="text-[11px] text-slate-400 mt-0.5">Taškai</div></div>
          <div className={card}><div className="text-2xl font-bold text-white">{rank?.avgViewers ? fmt(rank.avgViewers) : "–"}</div><div className="text-[11px] text-slate-400 mt-0.5">Vid. žiūrovai (30 d.)</div></div>
          <div className={card}><div className="text-2xl font-bold text-white">{hours ? hours.toFixed(1) : "–"}</div><div className="text-[11px] text-slate-400 mt-0.5">Valandos (30 d.){peak ? ` · pikas ${fmt(peak)}` : ""}</div></div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-3">Žiūrovai per 30 dienų</h2>
          <div className={`${card} pt-6`}>
            <div className="flex items-end gap-1 h-28">
              {bars.map((b, i) => (
                <div
                  key={i}
                  title={`${b.label}: ${b.v ? fmt(b.v) : "netransliavo"}`}
                  className={`flex-1 rounded-sm ${b.v ? "bg-indigo-500/70" : "bg-slate-800"}`}
                  style={{ height: `${b.v ? Math.max(6, (b.v / max) * 100) : 4}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-2"><span>{bars[0].label}</span><span>{bars[29].label}</span></div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-3">Klipai</h2>
          {clips.length === 0 ? (
            <p className="text-sm text-slate-500">Klipų kol kas nėra.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {clips.map((c) => (
                <a key={c.id} href={c.platform === "TWITCH" ? `https://clips.twitch.tv/${c.platformId}` : ch.url} target="_blank" rel="noopener noreferrer" className="group rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors">
                  <div className="relative aspect-video bg-slate-800">
                    {c.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <span className="absolute bottom-2 right-2 bg-slate-950/90 text-slate-200 text-[10px] font-semibold px-2 py-0.5 rounded">{dur(c.durationSec)}</span>
                  </div>
                  <div className="p-3"><div className="text-xs font-semibold text-white line-clamp-1 group-hover:text-indigo-300">{c.title}</div><div className="text-[11px] text-slate-500 mt-1">{fmt(c.views)} peržiūrų</div></div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
