import { prisma, yt, addChannelById } from "../lib/youtube";

async function resolve(input: string): Promise<string> {
  const s = input.trim();
  if (/^UC[\w-]{22}$/.test(s)) return s;

  if (s.startsWith("@")) {
    const r = await yt("channels", { part: "id", forHandle: s });
    if (r.items?.[0]?.id) return r.items[0].id;
    throw new Error("Kanalas nerastas: " + s);
  }

  let u: URL | null = null;
  try {
    u = new URL(s.startsWith("http") ? s : "https://" + s);
  } catch {
    /* ne nuoroda */
  }
  if (u) {
    const videoId =
      u.searchParams.get("v") ??
      (u.hostname === "youtu.be" ? u.pathname.slice(1) : null) ??
      null;
    const pathVideo = u.pathname.match(/^\/(?:live|shorts)\/([\w-]{11})/)?.[1];
    const vid = videoId || pathVideo;
    if (vid) {
      const r = await yt("videos", { part: "snippet", id: vid });
      const id = r.items?.[0]?.snippet?.channelId;
      if (!id) throw new Error("Vaizdo įrašas nerastas: " + vid);
      return id;
    }
    const ch = u.pathname.match(/^\/channel\/(UC[\w-]{22})/);
    if (ch) return ch[1];
    const h = u.pathname.match(/^\/(@[\w.\-]+)/);
    if (h) return resolve(h[1]);
  }
  throw new Error("Nepavyko atpažinti nuorodos: " + s);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Naudojimas: npm run add:youtube -- "https://www.youtube.com/@kanalas" "https://youtu.be/VIDEO_ID"');
    return;
  }
  for (const a of args) {
    try {
      const ch = await addChannelById(await resolve(a));
      console.log(`Pridėta: ${ch.displayName} (${ch.url}), sekėjai: ${ch.followers}`);
    } catch (e) {
      console.error("Nepavyko:", a, "-", (e as Error).message);
    }
  }
  await prisma.$disconnect();
}
main();
