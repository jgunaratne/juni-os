import { useState, useEffect, useCallback } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './News.css';

/* ── Types ──────────────────────────────────────────────── */

interface Article {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: 'nyt' | 'wsj' | 'bloomberg' | 'hn';
  sourceLabel: string;
  thumbnail?: string;
}

type SourceFilter = 'all' | 'nyt' | 'wsj' | 'bloomberg' | 'hn';

/* ── RSS Feed URLs ──────────────────────────────────────── */

const FEEDS: { key: Article['source']; label: string; url: string }[] = [
  {
    key: 'nyt',
    label: 'New York Times',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  },
  {
    key: 'wsj',
    label: 'Wall Street Journal',
    url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  },
  {
    key: 'bloomberg',
    label: 'Bloomberg',
    url: 'https://feeds.bloomberg.com/markets/news.rss',
  },
  {
    key: 'hn',
    label: 'Hacker News',
    url: 'https://news.ycombinator.com/rss',
  },
];

/* ── RSS Parser ─────────────────────────────────────────── */

function parseRSS(xml: string, source: Article['source'], sourceLabel: string): Article[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = doc.querySelectorAll('item');
  const articles: Article[] = [];

  items.forEach((item) => {
    const title = item.querySelector('title')?.textContent?.trim() ?? '';
    const description = item.querySelector('description')?.textContent?.trim() ?? '';
    const link = item.querySelector('link')?.textContent?.trim() ?? '';
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? '';

    // Try to extract thumbnail from media:content or enclosure
    let thumbnail: string | undefined;
    const mediaContent = item.querySelector('content');
    if (mediaContent?.getAttribute('url')) {
      thumbnail = mediaContent.getAttribute('url') ?? undefined;
    }
    const enclosure = item.querySelector('enclosure');
    if (!thumbnail && enclosure?.getAttribute('url')) {
      thumbnail = enclosure.getAttribute('url') ?? undefined;
    }

    if (title) {
      // Strip HTML tags from description
      const cleanDesc = description.replace(/<[^>]+>/g, '').trim();
      articles.push({
        title,
        description: cleanDesc.slice(0, 200),
        link,
        pubDate,
        source,
        sourceLabel,
        thumbnail,
      });
    }
  });

  return articles.slice(0, 15);
}

async function fetchFeed(feed: typeof FEEDS[number]): Promise<Article[]> {
  // Try direct fetch first
  try {
    const res = await fetch(feed.url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const text = await res.text();
      return parseRSS(text, feed.key, feed.label);
    }
  } catch {
    // CORS blocked — try proxy
  }

  // Try CORS proxy
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const text = await res.text();
      return parseRSS(text, feed.key, feed.label);
    }
  } catch {
    // Proxy also failed
  }

  return [];
}

/* ── Fallback Data ──────────────────────────────────────── */

function getSampleArticles(): Article[] {
  const now = new Date();
  const ago = (mins: number) => new Date(now.getTime() - mins * 60000).toUTCString();

  return [
    { title: 'Federal Reserve Signals Cautious Approach to Rate Adjustments', description: 'Fed officials indicated they would take a measured approach to interest rate changes, citing persistent inflation concerns alongside signs of economic cooling.', link: '#', pubDate: ago(15), source: 'nyt', sourceLabel: 'New York Times' },
    { title: 'Tech Giants Report Mixed Earnings Amid AI Spending Surge', description: 'Major technology companies posted divergent results as massive investments in artificial intelligence infrastructure weigh on short-term profitability.', link: '#', pubDate: ago(30), source: 'wsj', sourceLabel: 'Wall Street Journal' },
    { title: 'Global Markets Rally on Trade Deal Optimism', description: 'Stock markets across Asia and Europe surged as traders reacted to renewed momentum in bilateral trade negotiations between major economies.', link: '#', pubDate: ago(45), source: 'bloomberg', sourceLabel: 'Bloomberg' },
    { title: 'Supreme Court to Hear Major Technology Regulation Case', description: 'The court agreed to review a landmark case that could reshape how the government regulates social media platforms and content moderation.', link: '#', pubDate: ago(60), source: 'nyt', sourceLabel: 'New York Times' },
    { title: 'Oil Prices Climb as OPEC+ Considers Production Cuts', description: 'Crude oil futures rose sharply after reports that OPEC+ members are discussing additional supply reductions to stabilize prices.', link: '#', pubDate: ago(90), source: 'bloomberg', sourceLabel: 'Bloomberg' },
    { title: 'Housing Market Shows Signs of Stabilization', description: 'New data suggests the housing market may be finding a floor, with pending home sales ticking upward for the first time in months despite elevated mortgage rates.', link: '#', pubDate: ago(120), source: 'wsj', sourceLabel: 'Wall Street Journal' },
    { title: 'Climate Summit Yields New Commitments on Carbon Reduction', description: 'World leaders agreed to accelerated timelines for reducing carbon emissions, though critics say the pledges still fall short of what scientists recommend.', link: '#', pubDate: ago(150), source: 'nyt', sourceLabel: 'New York Times' },
    { title: 'Cryptocurrency Regulations Take Shape in Major Economies', description: 'Several countries unveiled comprehensive frameworks for regulating digital assets, bringing greater clarity to an industry long operating in gray areas.', link: '#', pubDate: ago(180), source: 'bloomberg', sourceLabel: 'Bloomberg' },
    { title: 'Automakers Accelerate EV Rollout With New Battery Tech', description: 'Leading car manufacturers announced breakthroughs in solid-state battery technology that could dramatically reduce charging times and extend range.', link: '#', pubDate: ago(210), source: 'wsj', sourceLabel: 'Wall Street Journal' },
    { title: 'Healthcare Costs Continue to Rise, Outpacing Inflation', description: 'A new report shows healthcare spending grew significantly faster than overall inflation, putting additional pressure on consumers and employers alike.', link: '#', pubDate: ago(240), source: 'nyt', sourceLabel: 'New York Times' },
    { title: 'Semiconductor Industry Faces New Supply Chain Challenges', description: 'Chipmakers are grappling with shifting geopolitical dynamics and export controls that threaten to reshape global supply chains for advanced semiconductors.', link: '#', pubDate: ago(280), source: 'bloomberg', sourceLabel: 'Bloomberg' },
    { title: 'Labor Market Remains Tight Despite Economic Headwinds', description: 'Unemployment held steady at historically low levels as employers in services and healthcare sectors continued to add positions at a strong pace.', link: '#', pubDate: ago(320), source: 'wsj', sourceLabel: 'Wall Street Journal' },
    { title: 'Show HN: A Minimal Rust Web Framework in 500 Lines', description: 'I built a lightweight web framework in Rust focusing on zero-cost abstractions and minimal dependencies. Feedback welcome.', link: '#', pubDate: ago(50), source: 'hn', sourceLabel: 'Hacker News' },
    { title: 'SQLite Is Not a Toy Database (2024)', description: 'SQLite handles billions of deployments and is the most widely deployed database engine in the world. Here\'s why it deserves serious consideration.', link: '#', pubDate: ago(110), source: 'hn', sourceLabel: 'Hacker News' },
    { title: 'Why We Moved from Kubernetes Back to Bare Metal', description: 'After two years on K8s, our small team found the operational complexity wasn\'t worth it. Here\'s what we learned.', link: '#', pubDate: ago(200), source: 'hn', sourceLabel: 'Hacker News' },
  ];
}

/* ── Time formatting ────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

/* ── Component ──────────────────────────────────────────── */

export default function NewsApp(_props: AppComponentProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [loading, setLoading] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    setUsingSample(false);

    try {
      const results = await Promise.all(FEEDS.map(fetchFeed));
      const allArticles = results.flat();

      if (allArticles.length === 0) {
        // All feeds failed — use sample data
        setArticles(getSampleArticles());
        setUsingSample(true);
      } else {
        // Sort by date, newest first
        allArticles.sort((a, b) => {
          const da = new Date(a.pubDate).getTime() || 0;
          const db = new Date(b.pubDate).getTime() || 0;
          return db - da;
        });
        setArticles(allArticles);
      }
    } catch {
      setArticles(getSampleArticles());
      setUsingSample(true);
    }

    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const filtered = filter === 'all'
    ? articles
    : articles.filter((a) => a.source === filter);

  const counts = {
    all: articles.length,
    nyt: articles.filter((a) => a.source === 'nyt').length,
    wsj: articles.filter((a) => a.source === 'wsj').length,
    bloomberg: articles.filter((a) => a.source === 'bloomberg').length,
    hn: articles.filter((a) => a.source === 'hn').length,
  };

  const tabs: { id: SourceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'nyt', label: 'NYT' },
    { id: 'wsj', label: 'WSJ' },
    { id: 'bloomberg', label: 'Bloomberg' },
    { id: 'hn', label: 'Hacker News' },
  ];

  return (
    <div className="news-app">
      {/* Header */}
      <div className="news-app__header">
        <div className="news-app__title">
          <span className="news-app__title-icon">📰</span>
          News
        </div>
      </div>

      {/* Source Tabs */}
      <div className="news-app__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`news-app__tab ${filter === tab.id ? 'news-app__tab--active' : ''}`}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span className="news-app__tab-badge">{counts[tab.id]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="news-app__content">
        {loading ? (
          <div className="news-app__loading">
            <div className="news-app__spinner" />
            <div className="news-app__loading-text">Fetching latest stories…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="news-app__error">
            <div className="news-app__error-icon">📭</div>
            <div>No stories available for this source.</div>
          </div>
        ) : (
          filtered.map((article, i) => (
            <div
              key={i}
              className="news-app__article"
              onClick={() => {
                if (article.link && article.link !== '#') {
                  window.open(article.link, '_blank');
                }
              }}
            >
              {article.thumbnail && (
                <img
                  className="news-app__article-thumb"
                  src={article.thumbnail}
                  alt=""
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="news-app__article-body">
                <span className={`news-app__article-source news-app__article-source--${article.source}`}>
                  {article.sourceLabel}
                </span>
                <div className="news-app__article-title">{article.title}</div>
                {article.description && (
                  <div className="news-app__article-desc">{article.description}</div>
                )}
                <div className="news-app__article-meta">
                  <span>{timeAgo(article.pubDate)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Status Bar */}
      <div className="news-app__status">
        <span>
          {usingSample ? 'Sample data' : `${articles.length} stories`}
          {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
        </span>
        <button className="news-app__refresh-btn" onClick={loadFeeds} disabled={loading}>
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
