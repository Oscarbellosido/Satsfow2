// ══════════════════════════════════════════════════════════════════════════
//  SATSFOW ETF Worker — Cloudflare Worker
//  Fa scraping de farside.co.uk cada dia a les 20:00 UTC i guarda a KV.
//
//  Desplegament:
//    1. wrangler kv:namespace create ETF_DATA  → copia l'ID a wrangler-etf.toml
//    2. wrangler deploy --config scripts/wrangler-etf.toml
//    3. Prova: curl https://satsfow-etf.TU_SUBDOMAIN.workers.dev/fetch
// ══════════════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json; charset=utf-8',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS });

const FARSIDE_URL = 'https://farside.co.uk/bitcoin-etf-flow-all-data/';
const FETCH_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Cache-Control':   'no-cache',
};

// ══════════════════════════════════════════════════════════════════════════
export default {

  // ── HTTP requests ────────────────────────────────────────────────────────
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const path = new URL(request.url).pathname;

    // GET /fetch → forçar scraping i actualitzar KV
    if (path === '/fetch') {
      const result = await scrapeAndStore(env);
      return json(result);
    }

    // GET / → servir dades en caché (o fallback)
    const cached = await env.ETF_DATA.get('etf', 'json').catch(() => null);
    if (cached) return json(cached);
    return json(getFallback());
  },

  // ── Cron trigger — cada dia a les 20:00 UTC ──────────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scrapeAndStore(env));
  },
};

// ══════════════════════════════════════════════════════════════════════════
async function scrapeAndStore(env) {
  try {
    const r = await fetch(FARSIDE_URL, {
      headers: FETCH_HEADERS,
      signal:  AbortSignal.timeout(20000),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status} from farside` };

    const html = await r.text();
    const data = parseETFTable(html);
    if (!data) return { ok: false, error: 'No ETF table found or parse failed' };

    // Guarda a KV amb TTL de 2 dies (per si el cron falla un dia)
    await env.ETF_DATA.put('etf', JSON.stringify(data), { expirationTtl: 172800 });
    return { ok: true, updatedAt: data.updatedAt, rows: data.days10.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
function parseETFTable(html) {
  // Busca <table class="etf">
  const tableMatch = html.match(/<table[^>]+class="etf"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;
  const tableHtml = tableMatch[1];

  // Capçaleres
  const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  if (!theadMatch) return null;
  const headers = [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim().toUpperCase());

  const col = name => headers.findIndex(h => h.includes(name.toUpperCase()));
  const ibitCol  = col('IBIT');
  const fbtcCol  = col('FBTC');
  const arkbCol  = col('ARKB');
  const totalCol = col('TOTAL');

  // Files de dades
  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return null;
  const rowMatches = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  const parseVal = (cells, idx) => {
    if (idx < 0 || idx >= cells.length) return null;
    const text = cells[idx].replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, '').trim();
    if (!text || text === '-' || text === '') return null;
    const n = parseFloat(text.replace(/,/g, '').replace(/\(/g, '-').replace(/\)/g, ''));
    return isNaN(n) ? null : n;
  };

  const flows = [];
  for (const row of rowMatches) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 2) continue;
    const dateVal = cells[0]?.replace(/<[^>]+>/g, '').trim() || '';
    if (!dateVal) continue;
    // Salta files de resum (Total, Average, Maximum, Minimum, etc.)
    if (/^(total|average|avg|max|min|maximum|minimum|ytd)/i.test(dateVal)) continue;
    const ibit  = parseVal(cells, ibitCol);
    const fbtc  = parseVal(cells, fbtcCol);
    const arkb  = parseVal(cells, arkbCol);
    const total = parseVal(cells, totalCol);
    if (ibit === null && fbtc === null && arkb === null && total === null) continue;
    flows.push({ date: dateVal, IBIT: ibit, FBTC: fbtc, ARKB: arkb, total });
  }

  if (!flows.length) return null;

  const last10 = flows.slice(-10);
  const last   = last10[last10.length - 1];

  // Acumulats des del llançament (gen. 2024)
  let ibitAcum = 0, fbtcAcum = 0, arkbAcum = 0, totalAcum = 0;
  for (const f of flows) {
    ibitAcum  += f.IBIT  || 0;
    fbtcAcum  += f.FBTC  || 0;
    arkbAcum  += f.ARKB  || 0;
    totalAcum += f.total || 0;
  }

  return {
    todayFlow:  last.total || 0,
    totalAcum:  Math.round(totalAcum),
    days10:     last10.map(f => ({ date: String(f.date).split(' ')[0], flow: f.total || 0 })),
    etfs: [
      { name: 'iShares (IBIT)', ticker: 'IBIT', acum: Math.round(ibitAcum), today: last.IBIT || 0 },
      { name: 'Fidelity (FBTC)', ticker: 'FBTC', acum: Math.round(fbtcAcum), today: last.FBTC || 0 },
      { name: 'ARK (ARKB)',      ticker: 'ARKB', acum: Math.round(arkbAcum), today: last.ARKB || 0 },
    ],
    dataDate:  last.date,
    updatedAt: new Date().toISOString(),
    isLive:    true,
  };
}

// ══════════════════════════════════════════════════════════════════════════
function getFallback() {
  return {
    todayFlow: 156.3, totalAcum: 36240,
    days10: [
      {date:'17',flow:312.4},{date:'18',flow:-89.3},
      {date:'19',flow:445.1},{date:'20',flow:178.6},
      {date:'21',flow:-234.8},{date:'24',flow:567.2},
      {date:'25',flow:123.4},{date:'26',flow:-45.7},
      {date:'27',flow:289.1},{date:'28',flow:156.3}
    ],
    etfs: [
      {name:'iShares (IBIT)', ticker:'IBIT', acum:21450, today:89.2},
      {name:'Fidelity (FBTC)',ticker:'FBTC', acum:8930,  today:38.1},
      {name:'ARK (ARKB)',     ticker:'ARKB', acum:2580,  today:12.4}
    ],
    dataDate: '28 Mar 2026', isLive: false,
  };
}
