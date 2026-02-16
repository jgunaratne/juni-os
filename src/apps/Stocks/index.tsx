import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './Stocks.css';

/* ── Types ──────────────────────────────────────────────── */

interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  history: number[]; // close prices for sparkline
}

/* ── Periods ─────────────────────────────────────────────── */

type Period = '1D' | '1W' | '1M' | '3M' | '1Y';
const PERIOD_PARAMS: Record<Period, { range: string; interval: string; points: number }> = {
  '1D': { range: '1d', interval: '5m', points: 78 },
  '1W': { range: '5d', interval: '15m', points: 35 },
  '1M': { range: '1mo', interval: '1d', points: 22 },
  '3M': { range: '3mo', interval: '1d', points: 63 },
  '1Y': { range: '1y', interval: '1wk', points: 52 },
};

/* ── Yahoo Finance Fetcher ──────────────────────────────── */

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V'];
const WATCHLIST_KEY = 'junios-stocks-watchlist';
const DJIA_SYMBOL = '^DJI';
const NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', GOOGL: 'Alphabet Inc.',
  AMZN: 'Amazon.com Inc.', NVDA: 'NVIDIA Corp.', META: 'Meta Platforms Inc.',
  TSLA: 'Tesla Inc.', 'BRK-B': 'Berkshire Hathaway', JPM: 'JPMorgan Chase & Co.',
  V: 'Visa Inc.',
};

function loadWatchlist(): string[] {
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [...DEFAULT_SYMBOLS];
}

function saveWatchlist(symbols: string[]): void {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols));
}

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        shortName?: string;
      };
      indicators?: {
        quote?: Array<{
          close?: (number | null)[];
        }>;
      };
    }>;
  };
}

async function fetchYahooChart(
  symbol: string,
  range = '5d',
  interval = '1d',
): Promise<{ price: number; prevClose: number; history: number[]; name?: string } | null> {
  try {
    const params = new URLSearchParams({ symbol, range, interval });
    const res = await fetch(`/api/stocks/chart?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data: YahooChartResult = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const history = closes.filter((c): c is number => c !== null && c !== undefined);
    const price = result.meta?.regularMarketPrice ?? history[history.length - 1] ?? 0;
    const prevClose = result.meta?.previousClose ?? history[0] ?? price;
    const name = result.meta?.shortName;

    return { price, prevClose, history, name };
  } catch {
    return null;
  }
}

async function fetchDJIA(period: Period): Promise<{ history: number[]; price: number; prevClose: number } | null> {
  const p = PERIOD_PARAMS[period];
  const data = await fetchYahooChart(DJIA_SYMBOL, p.range, p.interval);
  if (!data || data.history.length < 2) return null;
  return { history: data.history, price: data.price, prevClose: data.prevClose };
}

async function fetchStocksList(symbols: string[]): Promise<StockData[]> {
  const results = await Promise.all(
    symbols.map(async (sym): Promise<StockData | null> => {
      const data = await fetchYahooChart(sym, '5d', '1d');
      if (!data || data.history.length < 2) return null;

      const change = data.price - data.prevClose;
      const changePct = (change / data.prevClose) * 100;

      return {
        symbol: sym === 'BRK-B' ? 'BRK.B' : sym,
        name: data.name ?? NAMES[sym] ?? sym,
        price: data.price,
        change: parseFloat(change.toFixed(2)),
        changePct: parseFloat(changePct.toFixed(2)),
        history: data.history,
      };
    }),
  );
  return results.filter((s): s is StockData => s !== null);
}

/* ── Simulated Fallback Data ────────────────────────────── */

function generateHistory(basePrice: number, volatility: number, days: number): number[] {
  const prices: number[] = [];
  let price = basePrice * (1 - volatility * 0.5 + Math.random() * volatility);
  for (let i = 0; i < days; i++) {
    const change = (Math.random() - 0.48) * volatility * basePrice;
    price = Math.max(price + change, basePrice * 0.9);
    prices.push(parseFloat(price.toFixed(2)));
  }
  return prices;
}

const FALLBACK_PRICES: Record<string, number> = {
  AAPL: 242.50, MSFT: 432.80, GOOGL: 196.40, AMZN: 233.15, NVDA: 138.25,
  META: 719.40, TSLA: 352.60, 'BRK-B': 493.20, JPM: 268.40, V: 328.75,
};

function generateFallbackDJIA(period: Period): { history: number[]; price: number; prevClose: number } {
  const points = PERIOD_PARAMS[period].points;
  const history = generateHistory(44200, 0.008, points);
  return { history, price: history[history.length - 1], prevClose: history[0] };
}

function generateFallbackStocks(symbols: string[]): StockData[] {
  return symbols.map((sym) => {
    const basePrice = FALLBACK_PRICES[sym] ?? 100 + Math.random() * 400;
    const vol = 0.012;
    const history = generateHistory(basePrice, vol, 7);
    const currentPrice = history[history.length - 1];
    const prevPrice = history[history.length - 2];
    const change = currentPrice - prevPrice;
    const changePct = (change / prevPrice) * 100;
    return {
      symbol: sym === 'BRK-B' ? 'BRK.B' : sym,
      name: NAMES[sym] ?? sym,
      price: currentPrice,
      change: parseFloat(change.toFixed(2)),
      changePct: parseFloat(changePct.toFixed(2)),
      history,
    };
  });
}

/* ── SVG Chart Builder ──────────────────────────────────── */

function buildChartPaths(data: number[], width: number, height: number): { linePath: string; fillPath: string } {
  if (data.length < 2 || width <= 0 || height <= 0) return { linePath: '', fillPath: '' };

  const min = Math.min(...data) * 0.9998;
  const max = Math.max(...data) * 1.0002;
  const range = max - min || 1;
  const xStep = width / (data.length - 1);
  const toY = (val: number) => height - ((val - min) / range) * (height - 8) - 4;

  const points = data.map((v, i) => `${i * xStep},${toY(v)}`);
  const linePath = `M${points.join('L')}`;
  const fillPath = `${linePath}L${(data.length - 1) * xStep},${height}L0,${height}Z`;

  return { linePath, fillPath };
}

/* ── Canvas Sparkline ──────────────────────────────────── */

function drawSparkline(canvas: HTMLCanvasElement, data: number[], isUp: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || data.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xStep = w / (data.length - 1);
  const toY = (val: number) => h - ((val - min) / range) * (h - 4) - 2;

  ctx.beginPath();
  ctx.moveTo(0, toY(data[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(i * xStep, toY(data[i]));
  ctx.strokeStyle = isUp ? '#00c853' : '#ff1744';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/* ── Component ──────────────────────────────────────────── */

export default function StocksApp(_props: AppComponentProps) {
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [period, setPeriod] = useState<Period>('1W');
  const [djiaHistory, setDjiaHistory] = useState<number[]>([]);
  const [djiaPrice, setDjiaPrice] = useState(0);
  const [djiaPrev, setDjiaPrev] = useState(0);
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [tickerInput, setTickerInput] = useState('');
  const [addError, setAddError] = useState('');
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ w: 400, h: 120 });

  const djiaChange = djiaPrice - djiaPrev;
  const djiaChangePct = djiaPrev ? (djiaChange / djiaPrev) * 100 : 0;
  const djiaUp = djiaChange >= 0;

  // Load DJIA chart for the selected period
  const loadDJIA = useCallback(async (p: Period) => {
    setChartLoading(true);
    const real = await fetchDJIA(p);
    if (real && real.history.length > 1) {
      setDjiaHistory(real.history);
      setDjiaPrice(real.price);
      setDjiaPrev(real.prevClose);
      setIsLive(true);
    } else {
      const fb = generateFallbackDJIA(p);
      setDjiaHistory(fb.history);
      setDjiaPrice(fb.price);
      setDjiaPrev(fb.prevClose);
      setIsLive(false);
    }
    setChartLoading(false);
  }, []);

  // Load stock list
  const loadStocks = useCallback(async (symbols: string[]) => {
    setLoading(true);
    const real = await fetchStocksList(symbols);
    if (real.length > 0) {
      setStocks(real);
    } else {
      setStocks(generateFallbackStocks(symbols));
    }
    setLoading(false);
  }, []);

  // Initial load: DJIA + stocks
  useEffect(() => { loadDJIA(period); }, [loadDJIA, period]);
  useEffect(() => { loadStocks(watchlist); }, [loadStocks, watchlist]);

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
  }, []);

  // Measure chart container size
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setChartSize({ w: width, h: height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build SVG chart paths (memoized — no canvas, no disappearing)
  const chartColor = djiaUp ? 'rgb(0, 200, 83)' : 'rgb(255, 23, 68)';
  const { linePath, fillPath } = useMemo(
    () => buildChartPaths(djiaHistory, chartSize.w, chartSize.h),
    [djiaHistory, chartSize.w, chartSize.h],
  );

  // Draw sparklines
  const sparklineRef = useCallback(
    (symbol: string) => (el: HTMLCanvasElement | null) => {
      if (el) {
        const stock = stocks.find((s) => s.symbol === symbol);
        if (stock && stock.history.length > 1) {
          drawSparkline(el, stock.history, stock.change >= 0);
        }
      }
    },
    [stocks],
  );

  const handleAddTicker = useCallback(() => {
    const sym = tickerInput.trim().toUpperCase().replace('.', '-');
    if (!sym) return;
    if (watchlist.includes(sym)) {
      setAddError('Already in watchlist');
      setTimeout(() => setAddError(''), 2000);
      return;
    }
    const next = [...watchlist, sym];
    setWatchlist(next);
    saveWatchlist(next);
    setTickerInput('');
    setAddError('');
  }, [tickerInput, watchlist]);

  const handleRemoveTicker = useCallback((symbol: string) => {
    const sym = symbol === 'BRK.B' ? 'BRK-B' : symbol;
    const next = watchlist.filter((s) => s !== sym);
    setWatchlist(next);
    saveWatchlist(next);
  }, [watchlist]);

  const handleResetWatchlist = useCallback(() => {
    setWatchlist([...DEFAULT_SYMBOLS]);
    saveWatchlist([...DEFAULT_SYMBOLS]);
  }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="stocks-app">
      {/* Header */}
      <div className="stocks-app__header">
        <div className="stocks-app__title">📈 Stocks</div>
        <div className="stocks-app__subtitle">{dateStr}</div>
      </div>

      {/* DJIA Chart */}
      <div className="stocks-app__chart-section">
        {loading ? (
          <div className="stocks-app__loading">
            <div className="stocks-app__spinner" />
            <div className="stocks-app__loading-text">Fetching market data…</div>
          </div>
        ) : (
          <>
            <div className="stocks-app__chart-header">
              <div>
                <div className="stocks-app__chart-label">Dow Jones Industrial Average</div>
                <div className="stocks-app__chart-value">
                  {djiaPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className={`stocks-app__chart-change stocks-app__chart-change--${djiaUp ? 'up' : 'down'}`}>
                    {djiaUp ? '+' : ''}{djiaChange.toFixed(2)} ({djiaUp ? '+' : ''}{djiaChangePct.toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="stocks-app__chart-period">
                {(['1D', '1W', '1M', '3M', '1Y'] as Period[]).map((p) => (
                  <button
                    key={p}
                    className={`stocks-app__period-btn ${p === period ? 'stocks-app__period-btn--active' : ''}`}
                    onClick={() => handlePeriodChange(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div ref={chartContainerRef} className="stocks-app__chart-canvas" style={{ opacity: chartLoading ? 0.4 : 1, transition: 'opacity 0.2s' }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${chartSize.w} ${chartSize.h}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="djia-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {fillPath && <path d={fillPath} fill="url(#djia-grad)" />}
                {linePath && <path d={linePath} fill="none" stroke={chartColor} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
              </svg>
            </div>
          </>
        )}
      </div>

      {/* Watchlist Header + Add Ticker */}
      <div className="stocks-app__watchlist-header">
        <span>Watchlist ({watchlist.length})</span>
        <div className="stocks-app__add-ticker">
          <input
            className="stocks-app__ticker-input"
            type="text"
            placeholder="Add ticker…"
            value={tickerInput}
            onChange={(e) => { setTickerInput(e.target.value); setAddError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTicker(); }}
            spellCheck={false}
          />
          <button className="stocks-app__add-btn" onClick={handleAddTicker} disabled={!tickerInput.trim()}>
            +
          </button>
          <button className="stocks-app__reset-btn" onClick={handleResetWatchlist} title="Reset to defaults">
            ↺
          </button>
        </div>
      </div>
      {addError && <div className="stocks-app__add-error">{addError}</div>}

      {/* Stock List */}
      <div className="stocks-app__list">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#555', fontSize: 13 }}>Loading…</div>
        ) : (
          stocks.map((stock) => {
            const isUp = stock.change >= 0;
            return (
              <div key={stock.symbol} className="stocks-app__stock">
                <div className="stocks-app__stock-info">
                  <div className="stocks-app__stock-symbol">{stock.symbol}</div>
                  <div className="stocks-app__stock-name">{stock.name}</div>
                </div>
                <canvas ref={sparklineRef(stock.symbol)} className="stocks-app__stock-sparkline" />
                <div className="stocks-app__stock-price-col">
                  <div className="stocks-app__stock-price">${stock.price.toFixed(2)}</div>
                  <span className={`stocks-app__stock-change stocks-app__stock-change--${isUp ? 'up' : 'down'}`}>
                    {isUp ? '+' : ''}{stock.changePct.toFixed(2)}%
                  </span>
                </div>
                <button
                  className="stocks-app__remove-btn"
                  onClick={() => handleRemoveTicker(stock.symbol)}
                  title={`Remove ${stock.symbol}`}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Market Bar */}
      <div className="stocks-app__market-bar">
        <span>{isLive ? '● Live data from Yahoo Finance' : 'Simulated data (live feed unavailable)'}</span>
        <button className="stocks-app__refresh-btn" onClick={() => { loadDJIA(period); loadStocks(watchlist); }} disabled={loading}>↻ Refresh</button>
      </div>
    </div>
  );
}
