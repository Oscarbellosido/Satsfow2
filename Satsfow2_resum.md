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
| `technical` | 📊 | Gràfics OHLC (candlestick), indicadors tècnics, gràfic tècnic automàtic |
| `market` | 🏪 | Termòmetre (Fear & Greed + dominància + cap. total), ETF Bitcoin (fluxos) |
| `mempool` | ⛓️ | Fees recomanades, mempool, blocs recents, halving countdown |
| `atm` | 🏧 | Mapa d'ATMs Bitcoin (Leaflet + OpenStreetMap) |
| `news` | 📰 | Notícies Bitcoin filtrades per IA |
| `alerts` | 🔔 | Alertes de preu personalitzades (via Service Worker) |
| `macroglobal` | 🌍 | Propers esdeveniments, dominància BTC històrica, mapa d'adopció, correlació BTC vs MSTR/SPY/GLD/WTI |
| `cycles` | 🔄 | Cicles de mercat BTC, Rainbow Chart, Stock-to-Flow |
| `forecast` | 🔮 | Prediccions de preu + gràfic tècnic automàtic (suports/resistències/tendències) |
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
2. Fallback hardcoded (últimes dades conegudes: IBIT, FBTC, ARKB)

**Dies sense publicar:** farside no publica fins al tancament i el worker converteix
les cel·les buides en `0` (`last.total || 0`). La targeta detecta el cas amb una
heurística — dia amb *tots* els fons a zero — i mostra l'últim flux publicat amb un
"hoy sin publicar" en lloc d'un fals `+0M`. No s'ha canviat el worker perquè emeti
`null`: els clients amb la PWA cachejada fan `todayFlow.toFixed()` i petarien.

**Total acumulat:** és net de *tots* els ETF, inclosos els que no es llisten (GBTC i
les seves sortides), per això pot ser inferior a l'acumulat d'IBIT tot sol. La targeta
mostra una fila "Otros (incl. GBTC)" amb la diferència perquè la suma quadri a la vista.

**Fusió live + fallback:** quan el worker retorna dades en directe, es fusionen amb els ETFs del fallback per evitar que ETFs nous desapareguin si el worker encara no els coneix (`fetchETF`, ~línia 1290).

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

## Gràfic tècnic automàtic (`renderAutoTechnicalChart`)
Funció independent (~línia 2061) que genera un gràfic de veles SVG amb:
- **Suports** (verd) i **resistències** (vermell) detectats automàticament per swing points + clustering
- **Canals de tendència** alcista (blau) i baixista (taronja) per regressió lineal
- **Llegenda interpretativa** amb el suport/resistència més proper al preu actual i resum dels canals detectats
- Botó "Ampliar" per veure a pantalla completa (`expandAutoTech`)

S'usa **només al tab `technical`**. El tab `forecast` té una funció diferent,
`renderTechnicalOutlook()` ("Perspectiva Técnica a Corto Plazo").

Els seus nivells són també els que mostra la targeta "Soporte & Resistencia" del tab
`technical`: abans aquesta targeta els calculava com a min/max de 30 dies amb un ±2%
arbitrari i donava xifres diferents per al mateix nivell a la mateixa pantalla.

---

## ML adaptatiu (TensorFlow.js) — objecte `ML` (~línia 4098)
Xarxa petita (10→16→8→3, softmax) que aprèn quin bloc d'indicadors (Tècnic / On-chain / Macro)
ha predit millor el preu real, i ajusta els pesos del forecast al 40% (`ML.blend`).

- **Dades d'entrenament:** snapshots de `predictions` (IndexedDB) amb ≥7 dies d'antiguitat
  i amb `taTotal`/`onChainTotal`/`macroTotal`. Mínim 5 mostres.
- **Preu real a 7 dies:** `mlResolveReal()` — primer busca el snapshot d'aquella data a
  IndexedDB, i només com a fallback el `sf-pricelog` de localStorage.
- **Persistència:** model a `localstorage://sf-ml-model`, mètriques a `sf-ml-meta`.
- **Backend forçat a CPU** (`mlEnsureTF`): el model és minúscul i la CPU és ~6× més ràpida
  que WebGL aquí, a més d'evitar contextos WebGL trencats en WebViews/PWA.
- **`yieldEvery:'never'` al `fit()`** — crític: per defecte tfjs cedeix el control amb
  `requestAnimationFrame`, que no dispara mai amb la pàgina no visible i deixa
  l'entrenament penjat per sempre sense error. Hi ha també un timeout de 45s.
- **Diagnòstic:** `ML.lastError` (`tf_load_fail` | `train_timeout` | `insufficient`) i
  `ML.diag` ({total, aged, resolved}) es mostren al panell perquè es vegi la causa real.
- **UI:** la targeta és `renderMLCard()` amb `id="ml-card"`; `mlRender()` només substitueix
  aquesta targeta (re-renderitzar tota la pestanya feia un flaix i saltava l'scroll a dalt).
  Només quan canvien els pesos es re-renderitza tot, conservant la posició d'scroll.
- **Reentrenar:** cal `ML.model.dispose()` abans de crear-ne un de nou, o tfjs llança
  "Variable with name dense_Dense1/bias was already registered".
- **Influència variable (`mlEffectiveBlend`):** el ML no toca els pesos fins que la seva
  precisió supera el 50% per més d'un error estàndard (`MLC.minSamples`=20 mostres
  mínimes, escalat fins a `ML.blend`=40% quan l'avantatge arriba a `MLC.fullEdge`=10
  punts). Amb poques mostres el "54% de precisió" és soroll, i barrejar-lo al 40%
  contaminava el model base. `ML.blendUsed` és el % realment aplicat i es mostra al panell.

## Estructura de la pestanya Previsió
Ordre de targetes: perspectiva tècnica → disclaimer → **🔮 Señal global** (titular +
règim, amb `<details>` "Detalles del cálculo") → **🎯 Calidad del modelo** (fusiona en
una sola targeta el backtest per horitzó, la correcció de biaix i el panell ML, que
abans eren tres targetes amb tres percentatges no comparables) → rangs per horitzó →
factors (extrems visibles, els ~29-36 restants dins un `<details>`) → gràfic tècnic
automàtic → historial de prediccions.

La pestanya és **tota en castellà** (idioma per defecte de l'app). Els textos narratius
que genera `calcForecast` no passen per `t()`: si algun dia es tradueix, cal fer-ho allà.

---

## Repositori
- GitHub: `https://github.com/Oscarbellosido/Satsfow2`
- Branca principal: `main`
- Worktrees Claude: `.claude/worktrees/` (branques temporals de Claude Code, es poden ignorar)
