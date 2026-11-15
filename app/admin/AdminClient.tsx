"use client";

import { useCallback, useEffect, useState } from "react";

type Plat = "TWITCH" | "KICK" | "YOUTUBE";
type Status = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
type Ch = {
  id: string; platform: Plat; login: string; displayName: string; avatarUrl: string | null; url: string;
  status: Status; verified: boolean; followers: number; createdAt: string; activatedAt: string;
  lastLive: string | null; isLive: boolean; daysLeft: number | null; ownerName: string | null; adminNote: string | null;
};
type Counts = { active: number; removed: number; blocked: number; live: number; users: number; new24h: number };
type ListData = { items: Ch[]; total: number; page: number; totalPages: number; counts: Counts };
type Overview = {
  counts: Counts; expiring: Ch[]; newest: Ch[]; rankingDate: string | null;
  sync: { platform: Plat; live: number; lastSeen: string | null; channels: number }[];
};
type Detail = {
  channel: Ch & { platformId: string; language: string };
  liveTitle: string | null; rank: number | null; rankTotal: number; score: number | null;
  avgViewers: number | null; hours30: number; peak30: number; clips: number;
};
type Clip = { id: string; title: string; views: number; hidden: boolean; thumbnailUrl: string | null; channel: { displayName: string; platform: Plat } };
type UserRow = { id: string; displayName: string; avatarUrl: string | null; isAdmin: boolean; createdAt: string; providers: string[]; channels: { id: string; displayName: string; platform: Plat; status: Status }[] };
type LogRow = { id: string; adminName: string; action: string; target: string; createdAt: string };
type Notify = (ok: boolean, text: string) => void;
type Shared = { refreshKey: number; notify: Notify; bump: () => void; openDrawer: (id: string) => void };
type Tab = "overview" | "channels" | "clips" | "users" | "logs";

const PL: Record<Plat, string> = { TWITCH: "Twitch", KICK: "Kick", YOUTUBE: "YouTube" };
const PC: Record<Plat, string> = { TWITCH: "text-purple-400", KICK: "text-emerald-400", YOUTUBE: "text-red-400" };
const ST: Record<Status, { label: string; cls: string }> = {
  APPROVED: { label: "Aktyvus", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  EXPIRED: { label: "Pašalintas", cls: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
  REJECTED: { label: "Užblokuotas", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
  PENDING: { label: "Laukia", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
};
const inp = "bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500";
const btn = "px-2.5 py-1.5 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap";
const card = "rounded-xl bg-slate-900/60 border border-slate-800";

function ago(iso: string | null): string {
  if (!iso) return "–";
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 1) return "ką tik";
  if (m < 60) return `prieš ${m} min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `prieš ${h} val.`;
  return `prieš ${Math.floor(h / 24)} d.`;
}
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("lt-LT") : "–");
const fmt = (n: number) => n.toLocaleString("en-US");

async function call<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 403) window.location.href = "/";
  const data = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, status: r.status, data };
}

function StatusBadge({ c }: { c: Ch }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded-md border text-[11px] ${ST[c.status].cls}`}>{ST[c.status].label}</span>
      {c.isLive && <span className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-[11px] text-red-300 font-semibold">GYVAI</span>}
      {c.status === "APPROVED" && c.daysLeft !== null && c.daysLeft <= 3 && (
        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
          {c.daysLeft <= 0 ? "bus pašalintas netrukus" : `pašalinimas po ${c.daysLeft} d.`}
        </span>
      )}
    </div>
  );
}

function Avatar({ c }: { c: { displayName: string; avatarUrl: string | null } }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (c.avatarUrl) return <img src={c.avatarUrl} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-700" />;
  return <div className="w-9 h-9 rounded-lg bg-slate-800 shrink-0 flex items-center justify-center text-xs font-bold text-white">{c.displayName[0]}</div>;
}

function Pg({ page, totalPages, total, set }: { page: number; totalPages: number; total: number; set: (n: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
      <span>Puslapis {page} iš {totalPages} ({total})</span>
      <div className="flex gap-1">
        <button disabled={page <= 1} onClick={() => set(page - 1)} className="px-3 py-1.5 rounded-md border border-slate-800 bg-slate-900 disabled:opacity-40">‹ Atgal</button>
        <button disabled={page >= totalPages} onClick={() => set(page + 1)} className="px-3 py-1.5 rounded-md border border-slate-800 bg-slate-900 disabled:opacity-40">Toliau ›</button>
      </div>
    </div>
  );
}

/* ================= APŽVALGA ================= */
function OverviewTab({ refreshKey, notify, bump, openDrawer }: Shared) {
  const [d, setD] = useState<Overview | null>(null);
  useEffect(() => { call<Overview>("/api/admin/overview").then((r) => r.ok && setD(r.data)); }, [refreshKey]);

  async function quick(id: string, action: string) {
    const r = await call(`/api/admin/channels/${id}`, "PATCH", { action });
    notify(r.ok, r.ok ? "Atlikta" : "Nepavyko");
    bump();
  }
  if (!d) return <div className="p-8 text-center text-xs text-slate-500">Kraunama...</div>;
  const cards: [string, number][] = [
    ["Aktyvūs kanalai", d.counts.active], ["Gyvai dabar", d.counts.live], ["Nauji per 24 val.", d.counts.new24h],
    ["Pašalinti", d.counts.removed], ["Užblokuoti", d.counts.blocked], ["Vartotojai", d.counts.users],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(([l, v]) => (
          <div key={l} className={`${card} p-4`}><div className="text-2xl font-bold text-white">{fmt(v)}</div><div className="text-[11px] text-slate-400 mt-0.5">{l}</div></div>
        ))}
      </div>

      <div className={`${card} p-4`}>
        <h3 className="text-sm font-semibold text-white mb-1">Sinchronizacijos būklė</h3>
        <p className="text-[11px] text-slate-500 mb-3">Rodo, kada paskutinį kartą buvo atnaujintas bent vienas gyvas kanalas. Jei platformoje niekas nestreamina, laikas natūraliai „sensta“.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {d.sync.map((s) => {
            const mins = s.lastSeen ? (Date.now() - Date.parse(s.lastSeen)) / 60_000 : Infinity;
            const dot = s.live === 0 ? "bg-slate-500" : mins < 30 ? "bg-emerald-400" : mins < 120 ? "bg-amber-400" : "bg-red-400";
            return (
              <div key={s.platform} className="rounded-lg bg-slate-950/50 border border-slate-800 p-3">
                <div className={`flex items-center gap-2 text-xs font-semibold ${PC[s.platform]}`}><span className={`w-2 h-2 rounded-full ${dot}`} />{PL[s.platform]}</div>
                <div className="text-[11px] text-slate-400 mt-1.5">Gyvai: {s.live} · stebima kanalų: {s.channels}</div>
                <div className="text-[11px] text-slate-500">Atnaujinta: {s.live ? ago(s.lastSeen) : "nėra gyvų"}</div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Reitingas paskutinį kartą perskaičiuotas: {day(d.rankingDate)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${card} p-4`}>
          <h3 className="text-sm font-semibold text-white mb-3">Reikia dėmesio – netrukus bus pašalinti ({d.expiring.length})</h3>
          {d.expiring.length === 0 ? <p className="text-xs text-slate-500">Nėra kanalų, kuriems liko mažiau nei 3 dienos.</p> : (
            <ul className="divide-y divide-slate-800/80">
              {d.expiring.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center gap-3">
                  <Avatar c={c} />
                  <button onClick={() => openDrawer(c.id)} className="min-w-0 flex-1 text-left">
                    <div className="text-xs font-semibold text-white truncate hover:text-indigo-300">{c.displayName}</div>
                    <div className="text-[11px] text-slate-500">{PL[c.platform]} · gyvai {ago(c.lastLive)} · po {Math.max(0, c.daysLeft ?? 0)} d.</div>
                  </button>
                  <button onClick={() => quick(c.id, "remove")} className={`${btn} border-slate-600 text-slate-300 hover:bg-slate-700/50`}>Pašalinti</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${card} p-4`}>
          <h3 className="text-sm font-semibold text-white mb-3">Naujausi kanalai</h3>
          <ul className="divide-y divide-slate-800/80">
            {d.newest.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center gap-3">
                <Avatar c={c} />
                <button onClick={() => openDrawer(c.id)} className="min-w-0 flex-1 text-left">
                  <div className="text-xs font-semibold text-white truncate hover:text-indigo-300">{c.displayName}</div>
                  <div className="text-[11px] text-slate-500">{PL[c.platform]} · pridėtas {ago(c.createdAt)}{c.ownerName ? " · savininkas prisijungęs" : ""}</div>
                </button>
                {c.status === "APPROVED" && <button onClick={() => quick(c.id, "block")} className={`${btn} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}>Blokuoti</button>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ================= KANALAI ================= */
function ChannelsTab({ refreshKey, notify, bump, openDrawer }: Shared) {
  const [q, setQ] = useState("");
  const [plat, setPlat] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("new");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [bulkPlat, setBulkPlat] = useState("");
  const [bulkRes, setBulkRes] = useState<{ input: string; ok: boolean; name?: string; error?: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), sort });
    if (q) p.set("q", q);
    if (plat) p.set("platform", plat);
    if (status) p.set("status", status);
    if (filter) p.set("filter", filter);
    const r = await call<ListData>(`/api/admin/channels?${p}`);
    if (r.ok) setData(r.data);
  }, [page, q, plat, status, filter, sort]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load, refreshKey]);

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((c) => sel.includes(c.id));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSel(allSelected ? sel.filter((id) => !items.some((c) => c.id === id)) : Array.from(new Set([...sel, ...items.map((c) => c.id)])));
  const filt = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => { set(e.target.value); setPage(1); };

  async function bulkAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await call<{ results?: { input: string; ok: boolean; name?: string; error?: string }[]; error?: string }>("/api/admin/channels/bulk", "POST", { text: bulkText, platform: bulkPlat });
    setBusy(false);
    if (!r.ok) { notify(false, r.data.error ?? "Nepavyko pridėti"); return; }
    const res = r.data.results ?? [];
    setBulkRes(res);
    const ok = res.filter((x) => x.ok).length;
    notify(ok > 0, `Pridėta ${ok} iš ${res.length}`);
    if (ok) { setBulkText(""); setPage(1); bump(); }
  }

  async function bulkAction(action: string, label: string) {
    if (["block", "remove", "delete"].includes(action) && !confirm(`${label}: ${sel.length} kan.?${action === "delete" ? "\n\nIštrinti visam laikui kartu su statistika ir klipais." : ""}`)) return;
    const r = await call("/api/admin/channels/bulk-action", "POST", { ids: sel, action });
    notify(r.ok, r.ok ? "Atlikta" : "Nepavyko");
    setSel([]);
    bump();
  }

  async function rowAction(c: Ch, action: string) {
    if (action === "block" && !confirm(`Užblokuoti ${c.displayName}?`)) return;
    const r = await call(`/api/admin/channels/${c.id}`, "PATCH", { action });
    notify(r.ok, r.ok ? "Atlikta" : "Nepavyko");
    bump();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={bulkAdd} className={`${card} p-4`}>
        <div className="text-sm font-semibold text-white mb-1">Pridėti kanalus</div>
        <p className="text-[11px] text-slate-500 mb-2">Po vieną nuorodą ar @vardą eilutėje (iki 25). Platforma atpažįstama iš nuorodos; paprastiems vardams pasirinkite ją dešinėje.</p>
        <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={4} placeholder={"https://twitch.tv/vardas\nhttps://kick.com/kitas\nhttps://youtube.com/@kanalas"} className={`${inp} w-full font-mono`} />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <select value={bulkPlat} onChange={(e) => setBulkPlat(e.target.value)} className={inp} aria-label="Platforma paprastiems vardams">
            <option value="">Platforma pagal nuorodą</option><option value="TWITCH">Paprasti vardai: Twitch</option><option value="KICK">Paprasti vardai: Kick</option><option value="YOUTUBE">Paprasti vardai: YouTube</option>
          </select>
          <button disabled={busy || !bulkText.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold">{busy ? "Pridedama..." : "Pridėti"}</button>
          {bulkRes && <button type="button" onClick={() => setBulkRes(null)} className="text-[11px] text-slate-500 hover:text-slate-300">Paslėpti rezultatus</button>}
        </div>
        {bulkRes && (
          <ul className="mt-3 space-y-1 text-[11px]">
            {bulkRes.map((x, i) => (
              <li key={i} className={x.ok ? "text-emerald-300" : "text-red-300"}>{x.ok ? "✓" : "✗"} {x.ok ? x.name : `${x.input} – ${x.error}`}</li>
            ))}
          </ul>
        )}
      </form>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={filt(setQ)} placeholder="Ieškoti pagal vardą..." className={`${inp} flex-1 min-w-44`} />
        <select value={plat} onChange={filt(setPlat)} className={inp}><option value="">Visos platformos</option><option value="TWITCH">Twitch</option><option value="KICK">Kick</option><option value="YOUTUBE">YouTube</option></select>
        <select value={status} onChange={filt(setStatus)} className={inp}><option value="">Visi statusai</option><option value="APPROVED">Aktyvūs</option><option value="EXPIRED">Pašalinti</option><option value="REJECTED">Užblokuoti</option><option value="PENDING">Laukiantys</option></select>
        <select value={filter} onChange={filt(setFilter)} className={inp}><option value="">Visi kanalai</option><option value="live">Tik gyvai dabar</option><option value="expiring">Netrukus bus pašalinti</option><option value="verified">Patvirtinti ✓</option><option value="owned">Su prisijungusiu savininku</option></select>
        <select value={sort} onChange={filt(setSort)} className={inp}><option value="new">Naujausi</option><option value="old">Seniausi</option><option value="activated">Neseniai aktyvuoti</option><option value="followers">Daugiausia sekėjų</option><option value="name">Pagal vardą</option></select>
        <a href="/api/admin/channels/export" className={`${inp} flex items-center hover:border-slate-600`}>Eksportuoti CSV</a>
      </div>

      {sel.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 p-3 rounded-xl bg-indigo-950/90 border border-indigo-500/40 backdrop-blur">
          <span className="text-xs font-semibold text-white mr-1">Pažymėta: {sel.length}</span>
          <button onClick={() => bulkAction("restore", "Aktyvuoti")} className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}>Aktyvuoti</button>
          <button onClick={() => bulkAction("remove", "Pašalinti")} className={`${btn} border-slate-500 text-slate-200 hover:bg-slate-700/50`}>Pašalinti</button>
          <button onClick={() => bulkAction("block", "Užblokuoti")} className={`${btn} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}>Blokuoti</button>
          <button onClick={() => bulkAction("verify", "Patvirtinti")} className={`${btn} border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/10`}>Patvirtinti ✓</button>
          <button onClick={() => bulkAction("delete", "Ištrinti")} className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`}>Ištrinti</button>
          <button onClick={() => setSel([])} className="ml-auto text-[11px] text-slate-400 hover:text-white">Atšaukti pasirinkimą</button>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 text-[11px] text-slate-400">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Pažymėti visus puslapyje" className="accent-indigo-500" />
          <span>{data ? `${fmt(data.total)} kanalų` : "Kraunama..."}</span>
        </div>
        {!data ? <div className="p-8 text-center text-xs text-slate-500">Kraunama...</div> : items.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">Kanalų nerasta</div> : (
          <ul className="divide-y divide-slate-800/80">
            {items.map((c) => (
              <li key={c.id} className={`px-4 py-3 flex items-start gap-3 hover:bg-slate-800/30 ${sel.includes(c.id) ? "bg-indigo-500/5" : ""}`}>
                <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Pažymėti ${c.displayName}`} className="mt-3 accent-indigo-500" />
                <Avatar c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button onClick={() => openDrawer(c.id)} className="text-sm font-semibold text-white hover:text-indigo-300 truncate max-w-full">{c.displayName}</button>
                    {c.verified && <span className="text-[11px] text-indigo-400" title="Patvirtintas">✓</span>}
                    <span className={`text-[11px] ${PC[c.platform]}`}>{PL[c.platform]}</span>
                  </div>
                  <div className="mt-1"><StatusBadge c={c} /></div>
                  <div className="text-[11px] text-slate-500 mt-1.5">
                    {c.followers ? `${fmt(c.followers)} sekėjų · ` : ""}gyvai: {c.lastLive ? day(c.lastLive) : "dar nebuvo"} · pridėtas {day(c.createdAt)}
                    {c.ownerName ? ` · savininkas: ${c.ownerName}` : ""}{c.adminNote ? ` · 📝 ${c.adminNote}` : ""}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                  {c.status !== "APPROVED" ? (
                    <button onClick={() => rowAction(c, "restore")} className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}>Aktyvuoti</button>
                  ) : (
                    <button onClick={() => rowAction(c, "remove")} className={`${btn} border-slate-600 text-slate-300 hover:bg-slate-700/50`}>Pašalinti</button>
                  )}
                  <button onClick={() => openDrawer(c.id)} className={`${btn} border-slate-700 text-slate-300 hover:bg-slate-700/50`}>Plačiau</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && <Pg page={data.page} totalPages={data.totalPages} total={data.total} set={setPage} />}
    </div>
  );
}

/* ================= KLIPAI ================= */
function ClipsTab({ refreshKey, notify }: Shared) {
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState(false);
  const [clips, setClips] = useState<Clip[] | null>(null);
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (hidden) p.set("hidden", "1");
    const r = await call<{ clips: Clip[] }>(`/api/admin/clips?${p}`);
    if (r.ok) setClips(r.data.clips);
  }, [q, hidden]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load, refreshKey]);

  async function toggleClip(c: Clip) {
    const r = await call(`/api/admin/clips/${c.id}`, "PATCH", { hidden: !c.hidden });
    notify(r.ok, r.ok ? (c.hidden ? "Klipas vėl rodomas" : "Klipas paslėptas") : "Nepavyko");
    load();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ieškoti pagal pavadinimą ar kanalą..." className={`${inp} flex-1 min-w-48`} />
        <label className={`${inp} flex items-center gap-2 cursor-pointer`}><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="accent-indigo-500" />Tik paslėpti</label>
      </div>
      <div className={`${card} divide-y divide-slate-800/80`}>
        {!clips ? <div className="p-8 text-center text-xs text-slate-500">Kraunama...</div> : clips.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">Klipų nėra</div> : clips.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="w-24 h-14 rounded-md object-cover shrink-0" /> : <div className="w-24 h-14 rounded-md bg-slate-800 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-semibold truncate ${c.hidden ? "text-slate-500 line-through" : "text-white"}`}>{c.title}</div>
              <div className="text-[11px] text-slate-500">{c.channel.displayName} · {PL[c.channel.platform]} · {fmt(c.views)} peržiūrų</div>
            </div>
            <button onClick={() => toggleClip(c)} className={`${btn} shrink-0 ${c.hidden ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" : "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"}`}>{c.hidden ? "Rodyti" : "Slėpti"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= VARTOTOJAI ================= */
function UsersTab({ refreshKey, openDrawer }: Shared) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [d, setD] = useState<{ items: UserRow[]; total: number; page: number; totalPages: number } | null>(null);
  const load = useCallback(async () => {
    const r = await call<NonNullable<typeof d>>(`/api/admin/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    if (r.ok) setD(r.data);
  }, [page, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load, refreshKey]);
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Ieškoti vartotojo..." className={`${inp} w-full sm:w-72`} />
      <div className={`${card} divide-y divide-slate-800/80`}>
        {!d ? <div className="p-8 text-center text-xs text-slate-500">Kraunama...</div> : d.items.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">Vartotojų nerasta</div> : d.items.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3">
            <Avatar c={u} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{u.displayName}{u.isAdmin && <span className="ml-2 text-[10px] text-indigo-300 border border-indigo-500/40 rounded px-1.5 py-0.5">ADMIN</span>}</div>
              <div className="text-[11px] text-slate-500">Prisijungė su: {u.providers.join(", ") || "–"} · {day(u.createdAt)}</div>
              {u.channels.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {u.channels.map((c) => <button key={c.id} onClick={() => openDrawer(c.id)} className={`text-[11px] hover:underline ${PC[c.platform]}`}>{c.displayName}</button>)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {d && <Pg page={d.page} totalPages={d.totalPages} total={d.total} set={setPage} />}
    </div>
  );
}

/* ================= ŽURNALAS ================= */
function LogsTab({ refreshKey }: Shared) {
  const [items, setItems] = useState<LogRow[] | null>(null);
  useEffect(() => { call<{ items: LogRow[] }>("/api/admin/logs").then((r) => r.ok && setItems(r.data.items)); }, [refreshKey]);
  return (
    <div className={`${card} divide-y divide-slate-800/80`}>
      {!items ? <div className="p-8 text-center text-xs text-slate-500">Kraunama...</div> : items.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">Veiksmų dar nėra</div> : items.map((l) => (
        <div key={l.id} className="px-4 py-2.5 text-xs flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-slate-500 w-28 shrink-0">{ago(l.createdAt)}</span>
          <span className="font-semibold text-white">{l.action}</span>
          <span className="text-slate-400 min-w-0 truncate">{l.target}</span>
          <span className="text-slate-600 ml-auto">{l.adminName}</span>
        </div>
      ))}
    </div>
  );
}

/* ================= ŠONINĖ KORTELĖ ================= */
function Drawer({ id, onClose, notify, bump }: { id: string; onClose: () => void; notify: Notify; bump: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    const r = await call<Detail>(`/api/admin/channels/${id}`);
    if (r.ok) { setD(r.data); setNote(r.data.channel.adminNote ?? ""); }
  }, [id]);
  useEffect(() => { setD(null); load(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function act(action: string) {
    if (action === "block" && !confirm("Užblokuoti šį kanalą? Jis nebegalės būti pridėtas iš naujo, kol neatstatysite.")) return;
    const r = await call(`/api/admin/channels/${id}`, "PATCH", { action });
    notify(r.ok, r.ok ? "Atlikta" : "Nepavyko");
    load(); bump();
  }
  async function del() {
    if (!confirm("IŠTRINTI VISAM LAIKUI su visa statistika ir klipais?\n\nJei kanalas vis dar transliuoja lietuviškai, automatinė paieška gali jį pridėti iš naujo. Tokiu atveju geriau naudokite „Blokuoti“.")) return;
    const r = await call(`/api/admin/channels/${id}`, "DELETE");
    notify(r.ok, r.ok ? "Kanalas ištrintas" : "Nepavyko");
    bump(); onClose();
  }
  async function saveNote() {
    const r = await call(`/api/admin/channels/${id}`, "PATCH", { note });
    notify(r.ok, r.ok ? "Pastaba išsaugota" : "Nepavyko");
    bump();
  }

  const c = d?.channel;
  const row = (l: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800/60 text-xs"><span className="text-slate-500">{l}</span><span className="text-slate-200 text-right break-all">{v}</span></div>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="w-full sm:w-[28rem] h-full overflow-y-auto bg-slate-900 border-l border-slate-800 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Kanalo informacija</h3>
          <button onClick={onClose} aria-label="Uždaryti" className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        {!d || !c ? <div className="py-10 text-center text-xs text-slate-500">Kraunama...</div> : (
          <>
            <div className="flex items-center gap-3">
              <Avatar c={c} />
              <div className="min-w-0">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-base font-bold text-white hover:text-indigo-300 truncate block">{c.displayName}{c.verified && <span className="text-indigo-400 text-sm ml-1">✓</span>}</a>
                <div className={`text-xs ${PC[c.platform]}`}>{PL[c.platform]} · {c.login}</div>
              </div>
            </div>
            <div className="mt-3"><StatusBadge c={c} /></div>
            {d.liveTitle && <div className="mt-3 text-xs text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">Dabar transliuoja: {d.liveTitle}</div>}

            <div className="mt-4">
              {row("Reitingo vieta", d.rank ? `#${d.rank} iš ${d.rankTotal} (${d.score?.toFixed(1)} tšk.)` : "nėra reitinge")}
              {row("Vid. žiūrovai (30 d.)", d.avgViewers ? fmt(d.avgViewers) : "–")}
              {row("Valandos / pikas (30 d.)", `${d.hours30} val. / ${fmt(d.peak30)}`)}
              {row("Sekėjai", c.followers ? fmt(c.followers) : "–")}
              {row("Klipai", d.clips)}
              {row("Paskutinį kartą gyvai", c.lastLive ? `${day(c.lastLive)} (${ago(c.lastLive)})` : "dar nebuvo")}
              {row("Pridėtas", day(c.createdAt))}
              {row("Aktyvuotas", day(c.activatedAt))}
              {row("Pašalinimas po", c.daysLeft === null ? "–" : `${Math.max(0, c.daysLeft)} d.`)}
              {row("Savininkas", c.ownerName ?? "neprisijungęs")}
              {row("Kalba", c.language)}
              {row("Platformos ID", c.platformId)}
            </div>

            <div className="mt-4">
              <label className="text-[11px] text-slate-500">Pastaba (matote tik jūs)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="pvz. tikrinti, ar lietuvis" className={`${inp} w-full mt-1`} />
              <button onClick={saveNote} className={`${btn} mt-1.5 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10`}>Išsaugoti pastabą</button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {c.status !== "APPROVED" && <button onClick={() => act("restore")} className={`${btn} border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10`}>Aktyvuoti</button>}
              {c.status === "APPROVED" && <button onClick={() => act("remove")} className={`${btn} border-slate-600 text-slate-300 hover:bg-slate-700/50`}>Pašalinti</button>}
              {c.status !== "REJECTED" && <button onClick={() => act("block")} className={`${btn} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}>Blokuoti</button>}
              <button onClick={() => act(c.verified ? "unverify" : "verify")} className={`${btn} border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10`}>{c.verified ? "Nuimti ✓" : "Patvirtinti ✓"}</button>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className={`${btn} border-slate-700 text-slate-300 hover:bg-slate-700/50`}>Atidaryti platformoje</a>
              <button onClick={del} className={`${btn} border-red-500/40 text-red-300 hover:bg-red-500/10`}>Ištrinti visam laikui</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

/* ================= PAGRINDINIS ================= */
export default function AdminClient({ name }: { name: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify: Notify = (ok, text) => setToast({ ok, text });
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const shared: Shared = { refreshKey, notify, bump, openDrawer: setDrawer };

  const tabs: [Tab, string][] = [["overview", "Apžvalga"], ["channels", "Kanalai"], ["clips", "Klipai"], ["users", "Vartotojai"], ["logs", "Žurnalas"]];
  return (
    <main className="min-h-screen bg-[#0B0F17] text-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Admin panelė</h1>
            <p className="text-xs text-slate-500 mt-1">Prisijungta kaip {name}</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={bump} className="text-xs text-slate-400 hover:text-white">↻ Atnaujinti</button>
            <a href="/" className="text-xs text-indigo-400 hover:text-indigo-300">← Į svetainę</a>
          </div>
        </div>

        <div className="flex gap-1 mb-5 border-b border-slate-800 overflow-x-auto [scrollbar-width:none]">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === k ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab {...shared} />}
        {tab === "channels" && <ChannelsTab {...shared} />}
        {tab === "clips" && <ClipsTab {...shared} />}
        {tab === "users" && <UsersTab {...shared} />}
        {tab === "logs" && <LogsTab {...shared} />}
      </div>

      {drawer && <Drawer id={drawer} onClose={closeDrawer} notify={notify} bump={bump} />}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-xs border shadow-xl ${toast.ok ? "bg-emerald-950 border-emerald-500/40 text-emerald-200" : "bg-red-950 border-red-500/40 text-red-200"}`}>{toast.text}</div>
      )}
    </main>
  );
}
