"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Radio, Trophy, Film, Search, Play, ThumbsUp, Eye, X, ExternalLink,
  Activity, Sparkles, UserCheck, ArrowUpRight, TrendingUp, BadgeCheck,
} from "lucide-react";

type Platform = "TWITCH" | "KICK" | "YOUTUBE";
type Channel = {
  displayName: string; avatarUrl: string | null; url: string; platform: Platform;
  verified: boolean; followers: number; stats?: { avgViewers: number }[];
};
type Stream = {
  id: string; title: string; game: string; category: string; viewers: number;
  thumbnailUrl: string | null; tags: string[]; channel: Channel;
};
type Rank = {
  id: string; rank: number; score: number; growthPct: number | null; avgViewers: number; hours: number;
  partAudience: number; partConsistency: number; prevRank: number | null; isNew: boolean; prevAvgViewers: number | null; channel: Channel;
};
type Clip = {
  id: string; title: string; views: number; likes: number; durationSec: number;
  thumbnailUrl: string | null; embedUrl: string | null; channel: Channel;
};

const BRAND: Record<Platform, string> = {
  TWITCH: "M11.571 4.714h1.715v5.143H11.571zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z",
  KICK: "M1.333 0h21.334V24H1.333V0zm14.28 6.012h-3.21v3.818L8.683 6.012H5.068v11.976h3.615v-3.818l3.72 3.818h3.21l-4.733-4.858 4.733-7.136z",
  YOUTUBE: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
};
const PLAT: Record<Platform, { label: string; text: string; active: string }> = {
  TWITCH: { label: "Twitch", text: "text-purple-400", active: "bg-[#9146FF] text-white" },
  KICK: { label: "Kick", text: "text-emerald-400", active: "bg-[#53FC18] text-black" },
  YOUTUBE: { label: "YouTube", text: "text-red-400", active: "bg-[#FF0000] text-white" },
};

function Brand({ p, className = "w-4 h-4" }: { p: Platform; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="currentColor">
      <path d={BRAND[p]} />
    </svg>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");
const hue = (s: string) => [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 360;
const grad = (s: string) => ({
  background: `linear-gradient(135deg,hsl(${hue(s)},55%,14%),hsl(${(hue(s) + 60) % 360},65%,30%))`,
});
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Avatar({ name, src, className = "w-9 h-9 rounded-full text-xs" }: { name: string; src: string | null; className?: string }) {
  const [bad, setBad] = useState(false);
  if (src && !bad) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} className={`${className} shrink-0 object-cover border border-slate-700`} />
    );
  }
  return (
    <div className={`${className} shrink-0 flex items-center justify-center font-bold text-white border border-slate-700`} style={grad(name)}>
      {name[0]}
    </div>
  );
}

function Thumb({ src, seed, className = "" }: { src: string | null; seed: string; className?: string }) {
  const [bad, setBad] = useState(false);
  return (
    <div className={`overflow-hidden ${className}`} style={grad(seed)}>
      {src && !bad && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      )}
    </div>
  );
}

function useApi<T>(url: string, every = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as T;
        if (alive) { setData(j); setErr(false); }
      } catch {
        if (alive) setErr(true);
      }
    };
    load();
    const t = setInterval(load, every);
    return () => { alive = false; clearInterval(t); };
  }, [url, every]);
  return { data, err };
}

const NAV = [
  ["#transliacijos", "Transliacijos", Activity, "text-indigo-400"],
  ["#reitingas", "TOP Kanalai", Trophy, "text-amber-400"],
  ["#klipai", "Populiariausi Klipai", Film, "text-violet-400"],
] as const;

export default function Page() {
  const live = useApi<{ totals: { live: number; viewers: number }; streams: Stream[] }>("/api/streams/live");
  const [boardPage, setBoardPage] = useState(1);
  const [boardTab, setBoardTab] = useState<"all" | "TWITCH" | "KICK" | "YOUTUBE" | "rising">("all");
  const board = useApi<{ period: string | null; items: Rank[]; total: number; page: number; pageSize: number; totalPages: number }>(
    `/api/leaderboard?page=${boardPage}&tab=${boardTab === "rising" ? "rising" : "main"}&platform=${boardTab === "all" || boardTab === "rising" ? "" : boardTab}`,
    300_000
  );
  const clipsApi = useApi<{ clips: Clip[] }>("/api/clips", 300_000);
  const me = useApi<{ user: { id: string; displayName: string; avatarUrl: string | null; isAdmin?: boolean } | null }>("/api/auth/me", 300_000);

  const [plat, setPlat] = useState<"all" | Platform>("all");
  const [cat, setCat] = useState("visi");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "login" | "connect" | "done">(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setModal(null); setClip(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const streams = live.data?.streams ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return streams.filter(
      (x) =>
        (plat === "all" || x.channel.platform === plat) &&
        (cat === "visi" || x.category === cat) &&
        (!s || `${x.channel.displayName} ${x.title} ${x.game}`.toLowerCase().includes(s))
    );
  }, [streams, plat, cat, q]);

  const counts = (["TWITCH", "KICK", "YOUTUBE"] as Platform[]).map((p) => ({
    p, n: streams.filter((s) => s.channel.platform === p).length,
  }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setFormErr("");
    try {
      const r = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelName: f.get("name"), platform: f.get("platform"), url: f.get("url") }),
      });
      if (r.ok) setModal("done");
      else setFormErr(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Nepavyko pateikti paraiškos");
    } catch {
      setFormErr("Nepavyko pasiekti serverio");
    }
    setBusy(false);
  }

  const field = "w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500";
  const likeBtn = (c: Clip) => (
    <button
      onClick={(e) => { e.stopPropagation(); setLiked((l) => ({ ...l, [c.id]: !l[c.id] })); }}
      aria-label="Patinka"
      className={`flex items-center gap-1 transition-colors ${liked[c.id] ? "text-indigo-300" : "hover:text-slate-200"}`}
    >
      <ThumbsUp className={`w-3 h-3 text-indigo-400 ${liked[c.id] ? "fill-indigo-400" : ""}`} />
      {c.likes + (liked[c.id] ? 1 : 0)}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-indigo-900/20 via-purple-900/10 to-transparent blur-[120px]" />
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0B0F17]/80 backdrop-blur-xl border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href="#" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-[0_0_22px_rgba(124,58,237,.55)] group-hover:scale-105 transition-transform">
                <Radio className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-white">Streameriai<span className="text-indigo-400">.Lt</span></span>
            </a>
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Lietuvos Hub’as
            </div>
          </div>
          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map(([href, label, Icon, c]) => (
              <a key={href} href={href} className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition-all flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 ${c}`} />{label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => setModal("connect")} className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 px-3.5 py-2 rounded-lg transition-all">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />Prijungti Kanalą
            </button>
            {me.data?.user ? (
              <div className="flex items-center gap-2.5">
                <Avatar name={me.data.user.displayName} src={me.data.user.avatarUrl} className="w-8 h-8 rounded-full text-xs" />
                <span className="hidden sm:block text-xs font-semibold text-slate-200 max-w-[8rem] truncate">{me.data.user.displayName}</span>
                {me.data.user.isAdmin && <a href="/admin" className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1">Admin</a>}
                <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); }} className="text-xs text-slate-400 hover:text-white transition-colors">Atsijungti</button>
              </div>
            ) : (
              <button onClick={() => setModal("login")} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm shadow-indigo-600/30 transition-all active:scale-[.98]">
              <UserCheck className="w-3.5 h-3.5" />Prisijungti
            </button>
            )}
          </div>
        </div>
        <nav className="lg:hidden flex gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map(([href, label, Icon, c]) => (
            <a key={href} href={href} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-900 flex items-center gap-2 whitespace-nowrap">
              <Icon className={`w-3.5 h-3.5 ${c}`} />{label}
            </a>
          ))}
        </nav>
      </header>

      <main className="relative z-10">
        {/* HERO */}
        <section className="pt-12 pb-12 border-b border-slate-800/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />Oficiali Lietuvos Turinio Kūrėjų Platforma
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Atraskite ir Sekite Lietuvos{" "}
                <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-slate-100 bg-clip-text text-transparent">Tiesiogines Transliacijas</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-xl">
                Vieninga platforma, sujungianti <strong className="text-slate-200">Twitch</strong>, <strong className="text-slate-200">Kick</strong> ir <strong className="text-slate-200">YouTube</strong> turinio kūrėjus Lietuvoje. Realaus laiko analitika, reitingai ir bendruomenė.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a href="#transliacijos" className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-md transition-all">
                  <Activity className="w-4 h-4" />Žiūrėti Tiesiogiai
                </a>
                <button onClick={() => setModal("connect")} className="px-5 py-2.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 font-semibold text-xs flex items-center gap-2 transition-all">
                  Registruoti Kanalą<ArrowUpRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              {[
                ["indigo", Radio, live.data ? fmt(live.data.totals.live) : "–", "Aktyvūs Streameriai"],
                ["emerald", Eye, live.data ? fmt(live.data.totals.viewers) : "–", "Tiesioginiai Žiūrovai"],
              ].map(([c, Icon, v, l]) => {
                const I = Icon as typeof Radio;
                return (
                  <div key={l as string} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
                    <div className={`w-9 h-9 rounded-xl bg-${c}-500/10 border border-${c}-500/20 flex items-center justify-center text-${c}-400 mb-3`}><I className="w-4 h-4" /></div>
                    <div className="text-2xl font-bold text-white">{v as string}</div>
                    <div className="text-xs text-slate-400 mt-1 font-medium">{l as string}</div>
                  </div>
                );
              })}
              <div className="col-span-2 p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
                <div className="text-xs text-slate-400 mb-3 font-medium flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5 text-violet-400" />Gyvai pagal platformas</div>
                <div className="grid grid-cols-3 gap-3">
                  {counts.map(({ p, n }) => (
                    <div key={p} className="flex items-center gap-2.5">
                      <span className={PLAT[p].text}><Brand p={p} className="w-5 h-5" /></span>
                      <div>
                        <div className="text-lg font-bold text-white leading-none">{n}</div>
                        <div className="text-[11px] text-slate-500 mt-1">{PLAT[p].label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LIVE */}
        <section id="transliacijos" className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /><h2 className="text-2xl font-bold text-white tracking-tight">Tiesioginės Transliacijos</h2></div>
              <p className="text-xs text-slate-400 mt-1">Transliacijos vykstančios šiuo metu iš įvairių platformų</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ieškoti pagal vardą ar žaidimą..." className="pl-9 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-full sm:w-60" />
              </div>
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="visi">Visos Kategorijos</option><option value="gaming">Žaidimai</option><option value="esports">Esports</option><option value="irl">Pokalbiai / IRL</option><option value="tech">Technologijos</option>
              </select>
              <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                {(["all", "TWITCH", "KICK", "YOUTUBE"] as const).map((k) => (
                  <button key={k} onClick={() => setPlat(k)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${plat === k ? (k === "all" ? "bg-indigo-600 text-white" : PLAT[k].active) : "text-slate-400 hover:text-white"}`}>
                    {k !== "all" && <Brand p={k} className="w-3.5 h-3.5" />}{k === "all" ? "Visi" : PLAT[k].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {live.err && !live.data ? (
            <Empty title="Nepavyko gauti duomenų" text="Patikrinkite, ar veikia serveris (npm run dev) ir duomenų bazė." />
          ) : !live.data ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[0, 1, 2].map((i) => <div key={i} className="h-72 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Empty title="Šiuo metu gyvų transliacijų nerasta" text="Pakeiskite filtrus arba užsukite vėliau." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((s) => {
                const p = s.channel.platform;
                return (
                  <div key={s.id} className="group bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 flex flex-col">
                    <a href={s.channel.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-video">
                      <Thumb src={s.thumbnailUrl} seed={s.channel.displayName + s.game} className="absolute inset-0" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                      <span className={`absolute top-3 left-3 bg-slate-950/80 border border-slate-700/60 ${PLAT[p].text} text-[11px] font-medium px-2 py-1 rounded-md flex items-center gap-1.5`}><Brand p={p} className="w-3 h-3" />{PLAT[p].label}</span>
                      <span className="absolute top-3 right-3 bg-slate-950/90 border border-slate-800 text-slate-200 text-[11px] font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />{fmt(s.viewers)}</span>
                      <span className="absolute inset-0 bg-indigo-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><span className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Play className="w-5 h-5 ml-0.5" fill="currentColor" /></span></span>
                    </a>
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2.5">
                          <Avatar name={s.channel.displayName} src={s.channel.avatarUrl} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5"><h4 className="font-semibold text-white text-sm truncate">{s.channel.displayName}</h4>{s.channel.verified && <BadgeCheck className="w-3.5 h-3.5 text-indigo-400" />}</div>
                            <p className="text-xs text-slate-400 truncate">{s.game}</p>
                          </div>
                        </div>
                        <h3 className="text-xs text-slate-300 font-medium line-clamp-2 leading-relaxed mb-3">{s.title}</h3>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                        <div className="flex flex-wrap gap-1.5">{s.tags.map((t) => <span key={t} className="text-[10px] font-medium text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">#{t}</span>)}</div>
                        <a href={s.channel.url} target="_blank" rel="noopener noreferrer" aria-label="Atidaryti transliaciją" className="text-slate-500 hover:text-indigo-400 transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* LEADERBOARD */}
        <section id="reitingas" className="py-16 bg-slate-900/30 border-y border-slate-800/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md mb-2"><Trophy className="w-3.5 h-3.5" />Oficialus Reitingas</div>
                <h2 className="text-2xl font-bold text-white tracking-tight">TOP Streameriai Lietuvoje</h2>
                <p className="text-xs text-slate-400 mt-1">{boardTab === "rising" ? "Kanalai, kurių vidutinis žiūrovų skaičius per pastarąsias 7 dienas labiausiai išaugo, palyginti su ankstesnėmis 7 dienomis." : "Pastarųjų 30 dienų reitingas pagal vidutinį žiūrovų skaičių ir transliacijų nuoseklumą. Atnaujinamas kas valandą."}</p>
              </div>
              <div className="text-xs text-slate-500 font-medium">Duomenys sinchronizuojami per oficialias API sąsajas</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap bg-slate-900 p-1 rounded-lg border border-slate-800">
                {([["all", "Visi"], ["TWITCH", "Twitch"], ["KICK", "Kick"], ["YOUTUBE", "YouTube"], ["rising", "Kylančios"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setBoardTab(k); setBoardPage(1); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${boardTab === k ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>
                    {k === "TWITCH" || k === "KICK" || k === "YOUTUBE" ? (
                      <span className={PLAT[k].text}><Brand p={k} className="w-3.5 h-3.5" /></span>
                    ) : k === "rising" ? (
                      <span className="rise-icon text-emerald-400"><TrendingUp className="w-3.5 h-3.5" /></span>
                    ) : null}
                    {l}
                  </button>
                ))}
              </div>
              {boardTab !== "rising" && (
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-indigo-400" />Auditorija</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-400" />Nuoseklumas</span>
                </div>
              )}
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3.5 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <div className="col-span-1">Vieta</div><div className="col-span-3">Kūrėjas</div><div className="col-span-2 text-right">{boardTab === "rising" ? "Buvo (vid.)" : "Sekėjai"}</div><div className="col-span-2 text-right">Vid. Žiūrovai</div><div className="col-span-2 text-right">Augimas (7 d.)</div><div className="col-span-2 text-right">{boardTab === "rising" ? "Valandos (7 d.)" : "Taškai"}</div>
              </div>
              <div className="divide-y divide-slate-800/80">
                {!board.data ? <div className="p-8 text-center text-xs text-slate-500">{board.err ? "Nepavyko gauti reitingo" : "Kraunama..."}</div>
                  : board.data.items.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">{boardTab === "rising" ? "Kylančių sąrašas atsiras, kai susikaups bent 8 dienų istorija." : "Reitingas dar neskaičiuotas"}</div>
                  : board.data.items.map((t, idx) => {
                    const p = t.channel.platform;
                    const row = "sm:text-right flex sm:block justify-between text-xs";
                    const pos = ((board.data?.page ?? 1) - 1) * (board.data?.pageSize ?? 10) + idx + 1;
                    const rk = ["bg-amber-500/20 text-amber-400 border border-amber-500/40", "bg-slate-300/20 text-slate-200 border border-slate-300/40", "bg-amber-700/20 text-amber-500 border border-amber-700/40"][pos - 1] ?? "text-slate-500";
                    return (
                      <div key={t.id} className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-800/40 transition-colors">
                        <div className="col-span-1 flex sm:block items-center"><span className={`w-6 h-6 rounded-md inline-flex items-center justify-center text-xs font-bold ${rk}`}>{pos}</span>{boardTab === "all" && <Move rank={t.rank} prev={t.prevRank} isNew={t.isNew} />}</div>
                        <div className="col-span-3 flex items-center gap-3">
                          <Avatar name={t.channel.displayName} src={t.channel.avatarUrl} className="w-10 h-10 rounded-lg text-sm" />
                          <div><div className="flex items-center gap-2"><span className="font-semibold text-white text-sm">{t.channel.displayName}</span><span className={PLAT[p].text}><Brand p={p} className="w-3.5 h-3.5" /></span></div><span className="text-xs text-slate-500">{PLAT[p].label}</span></div>
                        </div>
                        <div className={`col-span-2 ${row} text-slate-300`}>{boardTab === "rising" ? (<><span className="sm:hidden text-slate-500">Buvo (vid.):</span><b className="font-semibold">{t.prevAvgViewers ? fmt(t.prevAvgViewers) : "–"}</b></>) : (<><span className="sm:hidden text-slate-500">Sekėjai:</span><b className="font-semibold">{t.channel.followers ? fmt(t.channel.followers) : "–"}</b></>)}</div>
                        <div className={`col-span-2 ${row} text-slate-300`}><span className="sm:hidden text-slate-500">Vid. žiūrovai:</span><b className="font-semibold">{t.avgViewers ? fmt(t.avgViewers) : "–"}</b></div>
                        <div className={`col-span-2 ${row} font-semibold ${t.growthPct === null ? "text-slate-500" : t.growthPct >= 0 ? "text-emerald-400" : "text-red-400"}`}><span className="sm:hidden text-slate-500">Augimas:</span><span>{t.growthPct === null ? "–" : `${t.growthPct >= 0 ? "+" : ""}${t.growthPct.toFixed(1)}%`}</span></div>
                        <div className={`col-span-2 ${row} text-indigo-300 font-semibold`}>
                          <span className="sm:hidden text-slate-500">{boardTab === "rising" ? "Valandos:" : "Taškai:"}</span>
                          {boardTab === "rising" ? (
                            <span>{t.hours.toFixed(1)}</span>
                          ) : (
                            <span className="block" title={`Auditorija ${t.partAudience.toFixed(1)} · Nuoseklumas ${t.partConsistency.toFixed(1)}`}>
                              <span className="block">{t.score.toFixed(1)}</span>
                              <span className="hidden sm:flex mt-1 h-1 w-16 ml-auto rounded-full overflow-hidden bg-slate-800">
                                <span className="bg-indigo-400" style={{ width: `${(t.partAudience / Math.max(t.score, 0.1)) * 100}%` }} />
                                <span className="bg-emerald-400" style={{ width: `${(t.partConsistency / Math.max(t.score, 0.1)) * 100}%` }} />
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          
            {board.data && board.data.totalPages > 1 && (
              <Pager
                page={board.data.page}
                total={board.data.totalPages}
                count={board.data.total}
                size={board.data.pageSize}
                onChange={(n) => {
                  setBoardPage(n);
                  document.getElementById("reitingas")?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            )}
          </div>
        </section>

        {/* CLIPS */}
        <section id="klipai" className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2"><Film className="w-5 h-5 text-indigo-400" />Populiariausi Savaitės Klipai</h2>
            <p className="text-xs text-slate-400 mt-1">Įsimintiniausi momentai iš Lietuvos streamų. Kol kas rodomi Twitch klipai, Kick klipai bus pridėti vėliau.</p>
          </div>
          {!clipsApi.data ? <div className="text-xs text-slate-500">{clipsApi.err ? "Nepavyko gauti klipų" : "Kraunama..."}</div>
            : clipsApi.data.clips.length === 0 ? <Empty title="Šiuo metu klipų nėra" text="Kol kas rodomi Twitch klipai, o Kick klipai bus pridėti vėliau, kai atsiras tokia galimybė." />
            : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {clipsApi.data.clips.map((c) => (
                  <div key={c.id} onClick={() => setClip(c)} className="group bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1">
                    <div className="relative aspect-video">
                      <Thumb src={c.thumbnailUrl} seed={c.channel.displayName + "clip"} className="absolute inset-0" />
                      <div className="absolute inset-0 flex items-center justify-center"><span className="w-10 h-10 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Play className="w-5 h-5 ml-0.5" fill="currentColor" /></span></div>
                      <span className="absolute bottom-2.5 right-2.5 bg-slate-950/90 text-slate-200 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-800">{dur(c.durationSec)}</span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-white text-xs line-clamp-1 group-hover:text-indigo-400 transition-colors">{c.title}</h3>
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/80">
                        <span className="font-medium text-slate-300">@{c.channel.displayName}</span>
                        <div className="flex items-center gap-3 text-[11px]">{likeBtn(c)}<span className="flex items-center gap-1"><Eye className="w-3 h-3 text-slate-500" />{fmt(c.views)}</span></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      </main>

      <footer className="relative z-10 bg-slate-950 border-t border-slate-800/80 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-2"><span className="font-bold text-slate-300 text-sm">Streameriai.Lt</span><span className="text-slate-600">|</span><span>© 2026 Visos teisės saugomos.</span></div>
          <div className="flex flex-wrap justify-center gap-6"><a href="#" className="hover:text-slate-300">Apie Projektą</a><a href="#" className="hover:text-slate-300">API Dokumentacija</a><a href="/privatumas" className="hover:text-slate-300">Privatumo Taisyklės</a><a href="#" className="hover:text-slate-300">Kontaktai</a></div>
        </div>
      </footer>

      {/* MODALS */}
      {modal && (
        <div onClick={() => setModal(null)} className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 relative shadow-2xl">
            <button onClick={() => setModal(null)} aria-label="Uždaryti" className="absolute top-3 right-3 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            {modal === "login" && (
              <>
                <div className="text-center mb-6"><h3 className="text-base font-bold text-white">Prisijungti prie Paskyros</h3><p className="text-xs text-slate-400 mt-1">Pasirinkite platformą autorizacijai</p></div>
                <div className="space-y-2.5">
                  {(["TWITCH", "KICK", "YOUTUBE"] as Platform[]).map((p) => {
                    const cls = `w-full py-2.5 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition-all ${p === "KICK" ? "bg-[#53FC18] text-black" : p === "TWITCH" ? "bg-[#9146FF] text-white hover:bg-[#7c2bf1]" : "bg-[#FF0000] text-white"}`;
                    return (
                      <a key={p} href={`/api/auth/${p === "YOUTUBE" ? "google" : p.toLowerCase()}`} className={cls}><Brand p={p} />Prisijungti su {PLAT[p].label}</a>
                    );
                  })}
                </div>
              </>
            )}
            {modal === "connect" && (
              <>
                <div className="mb-6"><h3 className="text-base font-bold text-white">Prijungti Kanalą</h3><p className="text-xs text-slate-400 mt-1">Kanalas pridedamas iš karto. Jei 5 dienas nestreaminsite, jis bus pašalintas ir teks jį pridėti iš naujo.</p></div>
                <form onSubmit={submit} className="space-y-4">
                  <div><label className="block text-xs font-medium text-slate-300 mb-1">Kanalo pavadinimas (nebūtina)</label><input name="name" placeholder="pvz. Gameris_LT" className={field} /></div>
                  <div><label className="block text-xs font-medium text-slate-300 mb-1">Pagrindinė platforma</label><select name="platform" className={field}><option value="TWITCH">Twitch.tv</option><option value="KICK">Kick.com</option><option value="YOUTUBE">YouTube</option></select></div>
                  <div><label className="block text-xs font-medium text-slate-300 mb-1">Kanalo nuoroda</label><input name="url" type="url" required placeholder="https://twitch.tv/kanalas" className={field} /></div>
                  {formErr && <p className="text-xs text-red-400">{formErr}</p>}
                  <button disabled={busy} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-xs rounded-lg shadow-md transition-all">{busy ? "Pridedama..." : "Pridėti Kanalą"}</button>
                </form>
              </>
            )}
            {modal === "done" && (
              <div className="text-center py-4"><div className="mx-auto w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-4"><BadgeCheck className="w-5 h-5" /></div><h3 className="text-base font-bold text-white">Kanalas pridėtas</h3><p className="text-xs text-slate-400 mt-1">Jis atsiras kataloge, kai pradėsite transliuoti. Jei 5 dienas nestreaminsite, kanalas bus pašalintas ir teks jį pridėti iš naujo.</p></div>
            )}
          </div>
        </div>
      )}

      {clip && (
        <div onClick={() => setClip(null)} className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden relative shadow-2xl">
            <button onClick={() => setClip(null)} aria-label="Uždaryti" className="absolute top-3 right-3 z-10 text-slate-300 hover:text-white"><X className="w-4 h-4" /></button>
            <div className="relative aspect-video bg-black">
              {clip.embedUrl ? (
                <iframe src={`${clip.embedUrl}&parent=${window.location.hostname}`} allowFullScreen title={clip.title} className="absolute inset-0 w-full h-full" />
              ) : (
                <>
                  <Thumb src={clip.thumbnailUrl} seed={clip.channel.displayName + "clip"} className="absolute inset-0" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-indigo-400"><Play className="w-12 h-12" fill="currentColor" /></div>
                </>
              )}
            </div>
            <div className="p-4 flex items-center justify-between gap-3">
              <div><h3 className="font-semibold text-white text-sm">{clip.title}</h3><p className="text-xs text-slate-400 mt-0.5">Kūrėjas: <strong className="text-indigo-400">@{clip.channel.displayName}</strong></p></div>
              <div className="shrink-0 text-xs text-slate-300">{likeBtn(clip)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center py-16 bg-slate-900/40 rounded-xl border border-slate-800">
      <div className="flex justify-center text-slate-600 mb-3"><Radio className="w-10 h-10" /></div>
      <p className="text-slate-300 font-medium text-sm">{title}</p>
      <p className="text-slate-500 text-xs mt-1">{text}</p>
    </div>
  );
}

function Pager({ page, total, count, size, onChange }: { page: number; total: number; count: number; size: number; onChange: (n: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, count);
  const nav = "px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <p className="text-xs text-slate-500">Rodoma {from}–{to} iš {count}</p>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className={nav}>‹ Atgal</button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-2 text-xs text-slate-600">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={`min-w-8 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${n === page ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700"}`}
            >
              {n}
            </button>
          )
        )}
        <button disabled={page >= total} onClick={() => onChange(page + 1)} className={nav}>Toliau ›</button>
      </div>
    </div>
  );
}

function Move({ rank, prev, isNew }: { rank: number; prev: number | null; isNew: boolean }) {
  const base = "ml-2 sm:ml-0 sm:mt-1 sm:block text-[10px]";
  if (isNew) return <span className={`${base} font-bold text-indigo-300`}>NAUJAS</span>;
  if (prev === null) return null;
  const d = prev - rank;
  if (d === 0) return <span className={`${base} text-slate-600`}>–</span>;
  return <span className={`${base} font-semibold ${d > 0 ? "text-emerald-400" : "text-red-400"}`}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</span>;
}
