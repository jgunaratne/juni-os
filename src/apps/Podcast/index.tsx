import { useState, useEffect, useCallback } from 'react';
import type { AppComponentProps } from '@/shared/types';
import { useWindowManager } from '@/kernel/windowManager';
import './Podcast.css';

/* ── Types ──────────────────────────────────────────────── */

interface PodcastResult {
  trackId: number;
  collectionName: string;
  artistName: string;
  artworkUrl100: string;
  artworkUrl600: string;
  feedUrl: string;
}

interface Episode {
  title: string;
  description: string;
  pubDate: string;
  audioUrl: string;
  duration: string;
}

type View = 'search' | 'detail';

/* ── Starred Podcasts Persistence ────────────────────────── */

const STARRED_KEY = 'junios-podcast-starred';

function loadStarred(): PodcastResult[] {
  try {
    const stored = localStorage.getItem(STARRED_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveStarred(list: PodcastResult[]): void {
  localStorage.setItem(STARRED_KEY, JSON.stringify(list));
}

/* ── Playback Progress Persistence ─────────────────────── */

const PROGRESS_KEY = 'junios-podcast-progress';

function loadProgress(): Record<string, number> {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function saveProgress(audioUrl: string, time: number): void {
  const all = loadProgress();
  if (time > 5) {
    all[audioUrl] = time;
  } else {
    delete all[audioUrl];
  }
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}

function getSavedProgress(audioUrl: string): number {
  return loadProgress()[audioUrl] ?? 0;
}

function clearProgress(audioUrl: string): void {
  const all = loadProgress();
  delete all[audioUrl];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}

/* ── iTunes Search API ──────────────────────────────────── */

const PROXY = 'https://api.allorigins.win/raw?url=';

async function searchPodcasts(query: string): Promise<PodcastResult[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=podcast&limit=20`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).filter((r: PodcastResult) => r.feedUrl);
  } catch {
    return [];
  }
}

/* ── RSS Episode Parser ─────────────────────────────────── */

async function fetchEpisodes(feedUrl: string): Promise<Episode[]> {
  // Try direct, then proxy
  for (const attempt of [feedUrl, `${PROXY}${encodeURIComponent(feedUrl)}`]) {
    try {
      const res = await fetch(attempt, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const xml = await res.text();
      return parseEpisodes(xml);
    } catch {
      continue;
    }
  }
  return [];
}

function parseEpisodes(xml: string): Episode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = doc.querySelectorAll('item');
  const episodes: Episode[] = [];

  items.forEach((item) => {
    const title = item.querySelector('title')?.textContent?.trim() ?? '';
    const desc = item.querySelector('description')?.textContent?.trim() ?? '';
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? '';
    const enclosure = item.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') ?? '';
    const duration =
      item.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', 'duration')[0]?.textContent?.trim() ??
      item.querySelector('duration')?.textContent?.trim() ?? '';

    if (title && audioUrl) {
      episodes.push({
        title,
        description: desc.replace(/<[^>]+>/g, '').slice(0, 200),
        pubDate,
        audioUrl,
        duration,
      });
    }
  });

  return episodes.slice(0, 50);
}

/* ── Time helpers ───────────────────────────────────────── */

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/* ── Global Audio State (persists across mount/unmount) ─── */

const globalAudio: {
  audio: HTMLAudioElement | null;
  episode: Episode | null;
  podcast: PodcastResult | null;
  interval: ReturnType<typeof setInterval> | null;
} = { audio: null, episode: null, podcast: null, interval: null };

/* ── Component ──────────────────────────────────────────── */

export default function PodcastApp(_props: AppComponentProps) {
  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [starred, setStarred] = useState<PodcastResult[]>(loadStarred);

  // Detail view
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastResult | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Player — restore from global audio if it exists
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(globalAudio.episode);
  const [currentPodcast, setCurrentPodcast] = useState<PodcastResult | null>(globalAudio.podcast);
  const [isPlaying, setIsPlaying] = useState(() => globalAudio.audio ? !globalAudio.audio.paused : false);
  const [currentTime, setCurrentTime] = useState(() => globalAudio.audio?.currentTime ?? 0);
  const [duration, setDuration] = useState(() => globalAudio.audio?.duration || 0);

  // Reconnect progress tracking when component remounts with active audio
  useEffect(() => {
    if (globalAudio.audio && !globalAudio.audio.paused && !globalAudio.interval) {
      globalAudio.interval = setInterval(() => {
        if (globalAudio.audio) {
          setCurrentTime(globalAudio.audio.currentTime);
          if (globalAudio.audio.duration) setDuration(globalAudio.audio.duration);
        }
      }, 500);
    }
  }, []);

  // Search
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setHasSearched(true);
    const res = await searchPodcasts(query.trim());
    setResults(res);
    setSearching(false);
  }, [query]);

  // Open podcast detail
  const openPodcast = useCallback(async (podcast: PodcastResult) => {
    setSelectedPodcast(podcast);
    setView('detail');
    setLoadingEpisodes(true);
    const eps = await fetchEpisodes(podcast.feedUrl);
    setEpisodes(eps);
    setLoadingEpisodes(false);
  }, []);

  // Star / Unstar
  const isStarred = useCallback((podcast: PodcastResult) => {
    return starred.some((s) => s.trackId === podcast.trackId);
  }, [starred]);

  const toggleStar = useCallback((podcast: PodcastResult, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarred((prev) => {
      const exists = prev.some((s) => s.trackId === podcast.trackId);
      const next = exists ? prev.filter((s) => s.trackId !== podcast.trackId) : [...prev, podcast];
      saveStarred(next);
      return next;
    });
  }, []);

  // Play episode
  const playEpisode = useCallback((episode: Episode, podcast: PodcastResult) => {
    // Save progress for current episode before switching
    if (globalAudio.audio && globalAudio.episode && globalAudio.audio.currentTime > 5) {
      saveProgress(globalAudio.episode.audioUrl, globalAudio.audio.currentTime);
    }
    // Stop current audio
    if (globalAudio.audio) {
      globalAudio.audio.pause();
      globalAudio.audio.src = '';
    }
    if (globalAudio.interval) {
      clearInterval(globalAudio.interval);
      globalAudio.interval = null;
    }

    const audio = new Audio(episode.audioUrl);
    globalAudio.audio = audio;
    globalAudio.episode = episode;
    globalAudio.podcast = podcast;
    setCurrentEpisode(episode);
    setCurrentPodcast(podcast);
    setCurrentTime(0);
    setDuration(0);

    const savedTime = getSavedProgress(episode.audioUrl);

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      if (savedTime > 0 && savedTime < audio.duration - 5) {
        audio.currentTime = savedTime;
        setCurrentTime(savedTime);
      }
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      clearProgress(episode.audioUrl);
      if (globalAudio.interval) { clearInterval(globalAudio.interval); globalAudio.interval = null; }
    });

    audio.play().then(() => {
      setIsPlaying(true);
      globalAudio.interval = setInterval(() => {
        if (globalAudio.audio) {
          setCurrentTime(globalAudio.audio.currentTime);
          if (globalAudio.audio.duration) setDuration(globalAudio.audio.duration);
          if (globalAudio.audio.currentTime > 5 && globalAudio.episode) {
            saveProgress(globalAudio.episode.audioUrl, globalAudio.audio.currentTime);
          }
        }
      }, 3000);
    }).catch(() => {
      setIsPlaying(false);
    });
  }, []);

  // Play/Pause toggle
  const togglePlayPause = useCallback(() => {
    if (!globalAudio.audio) return;
    if (isPlaying) {
      globalAudio.audio.pause();
      setIsPlaying(false);
      if (globalAudio.interval) { clearInterval(globalAudio.interval); globalAudio.interval = null; }
    } else {
      globalAudio.audio.play().then(() => {
        setIsPlaying(true);
        globalAudio.interval = setInterval(() => {
          if (globalAudio.audio) {
            setCurrentTime(globalAudio.audio.currentTime);
          }
        }, 500);
      });
    }
  }, [isPlaying]);

  // Seek
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!globalAudio.audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = ratio * duration;
    globalAudio.audio.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

  // Skip forward/back
  const skip = useCallback((secs: number) => {
    if (!globalAudio.audio) return;
    globalAudio.audio.currentTime = Math.max(0, Math.min(globalAudio.audio.currentTime + secs, duration));
    setCurrentTime(globalAudio.audio.currentTime);
  }, [duration]);

  // Keep audio alive on unmount (e.g. minimize), but stop when window is closed
  useEffect(() => {
    // Subscribe to window manager — if our window gets removed, stop audio
    const unsub = useWindowManager.subscribe((state) => {
      const exists = state.windows.some((w) => w.id === _props.windowId);
      if (!exists) {
        if (globalAudio.audio && globalAudio.episode && globalAudio.audio.currentTime > 5) {
          saveProgress(globalAudio.episode.audioUrl, globalAudio.audio.currentTime);
        }
        if (globalAudio.interval) { clearInterval(globalAudio.interval); globalAudio.interval = null; }
        if (globalAudio.audio) {
          globalAudio.audio.pause();
          globalAudio.audio.src = '';
          globalAudio.audio = null;
          globalAudio.episode = null;
          globalAudio.podcast = null;
        }
      }
    });

    return () => {
      unsub();
      // Save progress on unmount (minimize) but don't stop audio
      if (globalAudio.audio && globalAudio.episode && globalAudio.audio.currentTime > 5) {
        saveProgress(globalAudio.episode.audioUrl, globalAudio.audio.currentTime);
      }
      if (globalAudio.interval) { clearInterval(globalAudio.interval); globalAudio.interval = null; }
    };
  }, []);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="podcast-app">
      {/* Header */}
      <div className="podcast-app__header">
        <div className="podcast-app__title">🎙️ Podcasts</div>
        <div className="podcast-app__search-row">
          <input
            className="podcast-app__search-input"
            type="text"
            placeholder="Search podcasts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button
            className="podcast-app__search-btn"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
          >
            Search
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="podcast-app__content">
        {view === 'search' ? (
          <>
            {searching ? (
              <div className="podcast-app__loading">
                <div className="podcast-app__spinner" />
                <div className="podcast-app__loading-text">Searching podcasts…</div>
              </div>
            ) : !hasSearched ? (
              <>
                {starred.length > 0 && (
                  <>
                    <div className="podcast-app__section-label">★ Starred</div>
                    <div className="podcast-app__grid">
                      {starred.map((p) => (
                        <div key={p.trackId} className="podcast-app__card" onClick={() => openPodcast(p)}>
                          <div className="podcast-app__card-art-wrap">
                            <img className="podcast-app__card-art" src={p.artworkUrl600 || p.artworkUrl100} alt={p.collectionName} loading="lazy" />
                            <button className="podcast-app__star-btn podcast-app__star-btn--active" onClick={(e) => toggleStar(p, e)} title="Unstar">★</button>
                          </div>
                          <div className="podcast-app__card-title">{p.collectionName}</div>
                          <div className="podcast-app__card-author">{p.artistName}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {starred.length === 0 && (
                  <div className="podcast-app__empty">
                    <div className="podcast-app__empty-icon">🎧</div>
                    <div className="podcast-app__empty-title">Discover Podcasts</div>
                    <div className="podcast-app__empty-desc">Search for your favorite podcasts above</div>
                  </div>
                )}
              </>
            ) : results.length === 0 ? (
              <div className="podcast-app__empty">
                <div className="podcast-app__empty-icon">😔</div>
                <div className="podcast-app__empty-title">No results</div>
                <div className="podcast-app__empty-desc">Try a different search term</div>
              </div>
            ) : (
              <div className="podcast-app__grid">
                {results.map((p) => (
                  <div key={p.trackId} className="podcast-app__card" onClick={() => openPodcast(p)}>
                    <div className="podcast-app__card-art-wrap">
                      <img className="podcast-app__card-art" src={p.artworkUrl600 || p.artworkUrl100} alt={p.collectionName} loading="lazy" />
                      <button className={`podcast-app__star-btn ${isStarred(p) ? 'podcast-app__star-btn--active' : ''}`} onClick={(e) => toggleStar(p, e)} title={isStarred(p) ? 'Unstar' : 'Star'}>
                        {isStarred(p) ? '★' : '☆'}
                      </button>
                    </div>
                    <div className="podcast-app__card-title">{p.collectionName}</div>
                    <div className="podcast-app__card-author">{p.artistName}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : selectedPodcast ? (
          <>
            <button className="podcast-app__back-btn" onClick={() => setView('search')}>
              ← Back to results
            </button>

            <div className="podcast-app__detail-header">
              <img
                className="podcast-app__detail-art"
                src={selectedPodcast.artworkUrl600 || selectedPodcast.artworkUrl100}
                alt={selectedPodcast.collectionName}
              />
              <div className="podcast-app__detail-info">
                <div className="podcast-app__detail-title">{selectedPodcast.collectionName}</div>
                <div className="podcast-app__detail-author">{selectedPodcast.artistName}</div>
                <button
                  className={`podcast-app__detail-star ${isStarred(selectedPodcast) ? 'podcast-app__detail-star--active' : ''}`}
                  onClick={() => toggleStar(selectedPodcast)}
                >
                  {isStarred(selectedPodcast) ? '★ Starred' : '☆ Star'}
                </button>
              </div>
            </div>

            <div className="podcast-app__episodes-label">
              Episodes {!loadingEpisodes && `(${episodes.length})`}
            </div>

            {loadingEpisodes ? (
              <div className="podcast-app__loading">
                <div className="podcast-app__spinner" />
                <div className="podcast-app__loading-text">Loading episodes…</div>
              </div>
            ) : episodes.length === 0 ? (
              <div className="podcast-app__empty">
                <div className="podcast-app__empty-icon">📭</div>
                <div className="podcast-app__empty-desc">No playable episodes found</div>
              </div>
            ) : (
              episodes.map((ep, i) => {
                const isActive = currentEpisode?.audioUrl === ep.audioUrl;
                return (
                  <div key={i} className="podcast-app__episode">
                    <button
                      className={`podcast-app__ep-play-btn ${isActive && isPlaying ? 'podcast-app__ep-play-btn--playing' : ''}`}
                      onClick={() => {
                        if (isActive) {
                          togglePlayPause();
                        } else {
                          playEpisode(ep, selectedPodcast);
                        }
                      }}
                    >
                      {isActive && isPlaying ? '⏸' : '▶'}
                    </button>
                    <div className="podcast-app__ep-info">
                      <div className={`podcast-app__ep-title ${isActive ? 'podcast-app__ep-title--active' : ''}`}>
                        {ep.title}
                      </div>
                      <div className="podcast-app__ep-meta">{formatDate(ep.pubDate)}</div>
                    </div>
                    {ep.duration && <div className="podcast-app__ep-duration">{ep.duration}</div>}
                    {getSavedProgress(ep.audioUrl) > 0 && !(isActive && isPlaying) && (
                      <div className="podcast-app__ep-resume" title="Resume from where you left off">●</div>
                    )}
                  </div>
                );
              })
            )}
          </>
        ) : null}
      </div>

      {/* Player Bar */}
      {currentEpisode && currentPodcast && (
        <div className="podcast-app__player">
          <div className="podcast-app__player-top">
            <img
              className="podcast-app__player-art"
              src={currentPodcast.artworkUrl100}
              alt=""
            />
            <div className="podcast-app__player-info">
              <div className="podcast-app__player-title">{currentEpisode.title}</div>
              <div className="podcast-app__player-show">{currentPodcast.collectionName}</div>
            </div>
            <div className="podcast-app__player-controls">
              <button className="podcast-app__ctrl-btn" onClick={() => skip(-15)} title="Back 15s">⏪</button>
              <button className="podcast-app__ctrl-btn podcast-app__ctrl-btn--play" onClick={togglePlayPause}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button className="podcast-app__ctrl-btn" onClick={() => skip(30)} title="Forward 30s">⏩</button>
            </div>
          </div>
          <div className="podcast-app__progress-row">
            <span className="podcast-app__progress-time">{formatTime(currentTime)}</span>
            <div className="podcast-app__progress-bar" onClick={handleSeek}>
              <div className="podcast-app__progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="podcast-app__progress-time">{formatTime(duration)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
