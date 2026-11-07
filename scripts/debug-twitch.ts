try { process.loadEnvFile(); } catch {}

const ID = process.env.TWITCH_CLIENT_ID!;
const SECRET = process.env.TWITCH_CLIENT_SECRET!;

// Žinomi lietuvių kūrėjai (iš viešo Twitch statistikos sąrašo) – tik patikrai
const KNOWN = ["sampraimis", "benc1kas", "thezydas", "serifas", "sokoloco", "allezpatre", "foxassltu", "pyonte", "checkys"];

async function main() {
  const t = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ID, client_secret: SECRET, grant_type: "client_credentials" }),
  }).then((r) => r.json() as Promise<{ access_token: string }>);

  const h = { Authorization: `Bearer ${t.access_token}`, "Client-Id": ID };
  const get = (p: string) => fetch("https://api.twitch.tv/helix" + p, { headers: h }).then((r) => r.json() as Promise<any>);

  const lt = await get("/streams?language=lt&first=100");
  console.log("1) language=lt filtras:", lt.data?.length ?? lt, "gyvų srautų");

  const q = KNOWN.map((n) => `user_login=${n}`).join("&");
  const known = await get(`/streams?${q}`);
  console.log("2) Žinomi lietuviai, kurie dabar gyvai:", known.data?.length ?? known);
  for (const s of known.data ?? []) {
    console.log(`   - ${s.user_login}: kalba="${s.language}", žiūrovai=${s.viewer_count}, žaidimas=${s.game_name}`);
  }
}
main();
