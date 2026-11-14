// Siunčia pranešimą į Discord per webhook. Niekada nemeta klaidos ir nestabdo svetainės.
export async function notifyDiscord(content: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return; // webhook neįjungtas (pvz. vietiniame kompiuteryje)
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Streameriai.Lt",
        content: content.slice(0, 1900),
        allowed_mentions: { parse: [] }, // kanalo pavadinime įrašytas @everyone nieko neprišauks
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* Discord neatsako – ignoruojame */
  }
}
