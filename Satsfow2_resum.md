# SatsFlow — Resum tècnic

## Què és
PWA (Progressive Web App) de seguiment de Bitcoin en temps real. Una sola pàgina (`index.html`, ~5000 línies), sense framework, desplegada a GitHub Pages. Multiidioma (CA/ES/EN).

## URL de producció
`https://oscarbellosido.github.io/Satsfow2/`

Desplegament automàtic via `.github/workflows/deploy.yml` a cada push a `main`.

---

## Pestanyes (tabs)

| Tab | Icona | Contingut |
|-----|-------|-----------|
| `home` | 🏠 | Preu BTC (USD/EUR), gràfic de preus, Fear & Greed, conversió sats |
| `technical` | 📊 | Gràfics OHLC (candlestick), indicadors tècnics |
| `market` | 🏪 | ETF Bitcoin (fluxos), dominància BTC, mapa d'adopció |
| `mempool` | ⛓️ | Fees recomanades, mempool, blocs recents, halving countdown |
| `atm` | 🏧 | Mapa d'ATMs Bitcoin (Leaflet + OpenStreetMap) |
| `news` | 📰 | Notícies Bitcoin filtrades per IA |
| `alerts` | 🔔 | Alertes de preu personalitzades (via Service Worker) |
| `macroglobal` | 🌍 | Correlació BTC vs MSTR/SPY/GLD/WTI, dominància, mapa legal |
| `cycles` | 🔄 | Cicles de mercat BTC, Rainbow Chart, Stock-to-Flow |
| `forecast` | 🔮 | Prediccions de preu basades en cicles |
| `dca` | 📐 | Calculadora DCA (Dollar Cost Averaging) |

---

## Estat global (`S`)
Tot l'estat de l'app viu en l'objecte `S` (definit a la línia ~79):
- `S.price` — preu actual USD/EUR
- `S.etfData` — dades ETF (Worker o fallback)
- `S.currentTab` — pestanya activa
- `S.lang` — idioma (`ca`/`es`/`en`), guardat a `localStorage`
- `S.dark` — tema fosc/clar
- `S.alerts` — alertes de preu

---

## Fonts de dades

### Preu BTC
1. Binance API (`api.binance.com`) — principal
2. CoinGecko (`api.coingecko.com`) — fallback
3. Kraken — fallback addicional

### ETF Bitcoin (fluxos)
1. **Cloudflare Worker propi** `satsfow-etf.oscarbellosido.workers.dev` — **font principal**
   - Fa scraping de `farside.co.uk/bitcoin-etf-flow-all-data/` des de l'edge de CF
   - Guarda a KV (cache 2 dies), s'actualitza cada dia a les **20:00 UTC** via cron
   - Endpoint de forçar actualització: `/fetch`
2. Fallback hardcoded (últimes dades conegudes)

### Mempool / Mining
- `mempool.space/api` — fees, blocs, hashrate, dificultat

### Correlació d'actius (tab Macro)
- Yahoo Finance (`query1.finance.yahoo.com/v8/finance/chart/`) — MSTR, SPY, GLD, WTI (petroli)
- Stooq — fallback per a alguns actius

### Notícies
- Worker de notícies (`noticies` worker, directori `../Noticies/`) — filtra i tradueix notícies al català amb Claude AI
- Fallback: scraping RSS directe

### Dominància BTC
- CoinGecko (`/api/v3/global`)

---

## Cloudflare Workers

| Worker | URL | Funció |
|--------|-----|--------|
| `satsfow-etf` | `satsfow-etf.oscarbellosido.workers.dev` | Scraping ETF farside.co.uk, KV cache |
| `mecai` | `mecai.oscarbellosido.workers.dev` | Proxy CORS genèric (paràmetre `?url=`) |

### Worker ETF (`scripts/etf-worker.js`)
- Config: `scripts/wrangler-etf.toml`
- KV namespace: `ETF_DATA` (id: `f35636ac7c7348fe9d1c8edebe785e40`)
- Cron: `0 20 * * *` (20:00 UTC diari)
- Desplegar: `wrangler deploy --config scripts/wrangler-etf.toml`
- Forçar actualització: `curl https://satsfow-etf.oscarbellosido.workers.dev/fetch`

---

## Fitxers principals

```
index.html          — App SPA completa (~5000 línies, tot-en-un)
manifest.json       — Config PWA
sw.js               — Service Worker (cache offline + alertes push)
data/etf-flows.json — Fallback estàtic ETF
scripts/
  etf-worker.js     — Cloudflare Worker ETF (font principal de dades ETF)
  wrangler-etf.toml — Config wrangler per al Worker ETF
  scrape_etf.py     — Script Python legacy (substituït pel Worker)
.github/workflows/
  deploy.yml        — Deploy a GitHub Pages a cada push a main
  update-etf.yml    — GitHub Actions ETF (deprecated, substituït pel Worker CF)
```

---

## GitHub Actions
- `deploy.yml` — **Actiu.** Desplega a GitHub Pages a cada push a `main`.
- `update-etf.yml` — **Deprecated.** Substituït pel Worker CF. farside.co.uk bloqueja IPs de GitHub Actions (403 Cloudflare), per això no funcionava.

---

## PWA / Service Worker
- `sw.js` gestiona cache offline i notificacions push d'alertes de preu.
- Quan hi ha nova versió: banner de "Nova versió disponible" amb botó d'actualització.

---

## Tecnologies
- HTML5 + CSS3 + JavaScript pur (sense framework ni build step)
- Cloudflare Workers (edge functions) + KV storage
- Leaflet.js (mapes ATM)
- GitHub Pages (hosting estàtic)

---

## Repositori
- GitHub: `https://github.com/Oscarbellosido/Satsfow2`
- Branca principal: `main`
- Worktrees Claude: `.claude/worktrees/` (branques temporals de Claude Code, es poden ignorar)
