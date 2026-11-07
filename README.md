# Streameriai.Lt – backend (1 žingsnis)

Next.js (App Router) + PostgreSQL + Prisma. Šis žingsnis: duomenų bazė ir API, kurį vėliau naudos sąsaja.

## Paleidimas

```bash
cp .env.example .env
npm install
npm run db:up          # PostgreSQL per Docker
npm run db:migrate     # sukuria lenteles (paprašys migracijos pavadinimo, pvz. init)
npm run db:seed        # demonstraciniai duomenys
npm run dev
```

## Endpointai

| Metodas | Kelias | Paskirtis |
|---|---|---|
| GET | `/api/streams/live?platform=twitch&category=gaming&q=cs2` | gyvos transliacijos + bendri skaičiai |
| GET | `/api/leaderboard` | naujausias mėnesio TOP 50 |
| GET | `/api/clips` | populiariausi savaitės klipai |
| POST | `/api/submissions` | paraiška iš "Prijungti kanalą" formos |

POST pavyzdys:
```json
{ "channelName": "Gameris_LT", "platform": "TWITCH", "url": "https://twitch.tv/gameris_lt", "email": "a@b.lt" }
```

## Kas toliau
2. Tikri duomenys: workeris, kuris atnaujina `LiveStream` ir `ChannelStat` iš Twitch / YouTube / Kick.
3. Prisijungimas per OAuth (`User` lentelė jau paruošta).
4. Reitingo formulė (`Ranking` lentelė jau paruošta).

Pastaba: `/api/submissions` kol kas be apsaugos nuo piktnaudžiavimo (rate limit) – tai pridėsime kartu su Redis.
