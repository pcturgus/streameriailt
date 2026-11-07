"use client";

import { useCallback, useEffect, useState } from "react";

type Plat = "TWITCH" | "KICK" | "YOUTUBE";
type Status = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
type Ch = {
  id: string; platform: Plat; login: string; displayName: string; avatarUrl: string | null; url: string;
  status: Status; verified: boolean; followers: number; createdAt: string; lastLive: string | null;
};
type Data = {
  items: Ch[]; total: number; page: number; pageSize: number; totalPages: number;
  counts: { active: number; removed: number; blocked: number; live: number; users: number };
};
type Clip = {
  id: string; title: string; views: number; hidden: boolean; thumbnailUrl: string | null;
  channel: { displayName: string; platform: Plat };
};

const PL: Record<Plat, string> = { TWITCH: "Twitch", KICK: "Kick", YOUTUBE: "YouTube" };
const ST: Record<Status, { label: string; cls: string }> = {
  APPROVED: { label: "Aktyvus", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  EXPIRED: { label: "Pašalintas", cls: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
  REJECTED: { label: "Užblokuotas", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
  PENDING: { label: "Laukia", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
};
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("lt-LT") : "–");
const JSON_H = { "Content-Type": "application/json" };
const inp = "bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500";
const btn = "px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors";

export default function AdminClient({ name }: { name: string }) {
  const [tab, setTab] = useState<"channels" | "clips">("channels");
  const [q, setQ] = useState("");
  const [plat, setPlat] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [addPlat, setAddPlat] = useState<Plat>("TWITCH");
  const [addUrl, setAddUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const loadChannels = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page) });
    if (q) p.set("q", q);
    if (plat) p.set("platform", plat);
    if (status) p.set("status", status);
    const r = await fetch(`/api/admin/channels?${p}`);
    if (r.status === 403) { window.location.href = "/"; return; }
    if (r.ok) setData(await r.json());
  }, [page, q, plat, status]);

  const loadClips = useCallback(async () => {
    const r = await fetch("/api/admin/clips");
    if (r.ok) setClips(((await r.json()) as { clips: Clip[] }).clips);
  }, []);

  useEffect(() => {
    const t = setTimeout(loadChannels, 250);
    return () => clearTimeout(t);
  }, [loadChannels]);
  useEffect(() => { if (tab === "clips") loadClips(); }, [tab, loadClips]);

  const notify = (ok: boolean, text: string) => setMsg({ ok, text });

  async function channelAction(c: Ch, action: string) {
    const warn: Record<string, string> = {
      block: `Užblokuoti ${c.displayName}? Kanalas nebegalės būti pridėtas iš naujo, kol jo neatstatysite.`,
      remove: `Pašalinti ${c.displayName} iš katalogo? Kanalą bus galima pridėti iš naujo.`,
    };
    if (warn[action] && !confirm(warn[action])) return;
    const r = await fetch(`/api/admin/channels/${c.id}`, { method: "PATCH", headers: JSON_H, body: JSON.stringify({ action }) });
    notify(r.ok, r.ok ? "Atlikta" : "Nepavyko");
    loadChannels();
  }

  async function deleteChannel(c: Ch) {
    if (!confirm(`IŠTRINTI ${c.displayName} VISAM LAIKUI su visa statistika ir klipais?\n\nJei kanalas vis dar transliuoja lietuviškai, paieška pagal kalbą gali jį pridėti iš naujo. Tokiu atveju geriau naudokite „Blokuoti“.`)) return;
    const r = await fetch(`/api/admin/channels/${c.id}`, { method: "DELETE" });
    notify(r.ok, r.ok ? "Kanalas ištrintas" : "Nepavyko ištrinti");
    loadChannels();
  }

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/admin/channels", { method: "POST", headers: JSON_H, body: JSON.stringify({ platform: addPlat, url: addUrl }) });
    const j = (await r.json().catch(() => ({}))) as { name?: string; error?: string };
    notify(r.ok, r.ok ? `Pridėta: ${j.name}` : j.error ?? "Nepavyko pridėti");
    if (r.ok) { setAddUrl(""); setPage(1); loadChannels(); }
    setBusy(false);
  }

  async function toggleClip(c: Clip) {
    const r = await fetch(`/api/admin/clips/${c.id}`, { method: "PATCH", headers: JSON_H, body: JSON.stringify({ hidden: !c.hidden }) });
    notify(r.ok, r.ok ? (c.hidden ? "Klipas vėl rodomas" : "Klipas paslėptas") : "Nepavyko");
    loadClips();
  }

  const cards: [string, number | string][] = data
    ? [["Aktyvūs kanalai", data.counts.active], ["Gyvai dabar", data.counts.live], ["Pašalinti", data.counts.removed], ["Užblokuoti", data.counts.blocked], ["Vartotojai", data.counts.users]]
    : [];

  return (
    <main className="min-h-screen bg-[#0B0F17] text-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Admin panelė</h1>
            <p className="text-xs text-slate-500 mt-1">Prisijungta kaip {name}</p>
          </div>
          <a href="/" className="text-xs text-indigo-400 hover:text-indigo-300">← Į svetainę</a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {cards.map(([l, v]) => (
            <div key={l} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xl font-bold text-white">{v}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{l}</div>
            </div>
          ))}
        </div>

        {msg && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-xs border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
            {msg.text}
          </div>
        )}

        <div className="flex gap-1 mb-5 border-b border-slate-800">
          {(["channels", "clips"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${tab === t ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>
              {t === "channels" ? "Kanalai" : "Klipai"}
            </button>
          ))}
        </div>

        {tab === "channels" && (
          <>
            <form onSubmit={addChannel} className="flex flex-wrap gap-2 mb-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <select value={addPlat} onChange={(e) => setAddPlat(e.target.value as Plat)} className={inp}>
                <option value="TWITCH">Twitch</option><option value="KICK">Kick</option><option value="YOUTUBE">YouTube</option>
              </select>
              <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} required placeholder="Kanalo nuoroda arba vardas" className={`${inp} flex-1 min-w-56`} />
              <button disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold">
                {busy ? "Pridedama..." : "Pridėti kanalą"}
              </button>
            </form>

            <div className="flex flex-wrap gap-2 mb-3">
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Ieškoti pagal vardą..." className={`${inp} flex-1 min-w-48`} />
              <select value={plat} onChange={(e) => { setPlat(e.target.value); setPage(1); }} className={inp}>
                <option value="">Visos platformos</option><option value="TWITCH">Twitch</option><option value="KICK">Kick</option><option value="YOUTUBE">YouTube</option>
              </select>
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inp}>
                <option value="">Visi statusai</option><option value="APPROVED">Aktyvūs</option><option value="EXPIRED">Pašalinti</option><option value="REJECTED">Užblokuoti</option><option value="PENDING">Laukiantys</option>
              </select>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="px-4 py-3">Kanalas</th><th className="px-3 py-3">Statusas</th><th className="px-3 py-3">Sekėjai</th>
                    <th className="px-3 py-3">Paskutinį kartą gyvai</th><th className="px-3 py-3">Pridėtas</th><th className="px-3 py-3 text-right">Veiksmai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {!data ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">Kraunama...</td></tr>
                  ) : data.items.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">Kanalų nerasta</td></tr>
                  ) : (
                    data.items.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-indigo-300">{c.displayName}</a>
                          {c.verified && <span className="ml-1.5 text-[10px] text-indigo-400">✓</span>}
                          <div className="text-[11px] text-slate-500">{PL[c.platform]}{c.id.length ? "" : ""}</div>
                        </td>
                        <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-md border text-[11px] ${ST[c.status].cls}`}>{ST[c.status].label}</span></td>
                        <td className="px-3 py-3 text-slate-300">{c.followers ? c.followers.toLocaleString("en-US") : "–"}</td>
                        <td className="px-3 py-3 text-slate-300">{date(c.lastLive)}</td>
                        <td className="px-3 py-3 text-slate-400">{date(c.createdAt)}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5 justify-end">
                            {c.status !== "APPROVED" && <button onClick={() => channelAction(c, "restore")} className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}>Aktyvuoti</button>}
                            {c.status === "APPROVED" && <button onClick={() => channelAction(c, "remove")} className={`${btn} border-slate-600 text-slate-300 hover:bg-slate-700/50`}>Pašalinti</button>}
                            {c.status !== "REJECTED" && <button onClick={() => channelAction(c, "block")} className={`${btn} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}>Blokuoti</button>}
                            <button onClick={() => channelAction(c, c.verified ? "unverify" : "verify")} className={`${btn} border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10`}>{c.verified ? "Nuimti ✓" : "Patvirtinti ✓"}</button>
                            <button onClick={() => deleteChannel(c)} className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`}>Ištrinti</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                <span>Puslapis {data.page} iš {data.totalPages} ({data.total} kanalų)</span>
                <div className="flex gap-1">
                  <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className="px-3 py-1.5 rounded-md border border-slate-800 bg-slate-900 disabled:opacity-40">‹ Atgal</button>
                  <button disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)} className="px-3 py-1.5 rounded-md border border-slate-800 bg-slate-900 disabled:opacity-40">Toliau ›</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "clips" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/80">
            {!clips ? (
              <div className="p-8 text-center text-xs text-slate-500">Kraunama...</div>
            ) : clips.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Klipų nėra</div>
            ) : (
              clips.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="w-24 h-14 rounded-md object-cover shrink-0" /> : <div className="w-24 h-14 rounded-md bg-slate-800 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-semibold truncate ${c.hidden ? "text-slate-500 line-through" : "text-white"}`}>{c.title}</div>
                    <div className="text-[11px] text-slate-500">{c.channel.displayName} · {PL[c.channel.platform]} · {c.views.toLocaleString("en-US")} peržiūrų</div>
                  </div>
                  <button onClick={() => toggleClip(c)} className={`${btn} shrink-0 ${c.hidden ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" : "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"}`}>
                    {c.hidden ? "Rodyti" : "Slėpti"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}
