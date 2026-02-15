import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './Map.css';

/* ── Leaflet Loader ─────────────────────────────────────── */

let leafletLoaded = false;
let leafletPromise: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if (leafletLoaded) return Promise.resolve();
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise<void>((resolve, reject) => {
    // CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    // JS
    if ((window as unknown as Record<string, unknown>).L) {
      leafletLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { leafletLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });

  return leafletPromise;
}

/* ── Nominatim Geocoding ────────────────────────────────── */

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function geocode(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'JuniOS-MapApp/1.0' },
  });
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  return res.json();
}

/* ── Component ──────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const L: any;

export default function MapApp(_props: AppComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Initialize map
  useEffect(() => {
    let cancelled = false;

    loadLeaflet().then(() => {
      if (cancelled || !mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
      }).setView([37.7749, -122.4194], 12); // Default: San Francisco

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;
      setReady(true);

      // Fix tile rendering after container becomes visible
      setTimeout(() => map.invalidateSize(), 100);
    }).catch(() => {
      if (!cancelled) setError('Failed to load map library');
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Resize handler
  useEffect(() => {
    if (!mapRef.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize();
    });
    if (mapContainerRef.current) observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, [ready]);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setResults([]);

    try {
      const data = await geocode(q);
      if (data.length === 0) {
        setError('No results found');
      } else {
        setResults(data);
        // Auto-select first result
        const first = data[0];
        const lat = parseFloat(first.lat);
        const lon = parseFloat(first.lon);
        goToLocation(lat, lon, first.display_name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const goToLocation = useCallback((lat: number, lon: number, name: string) => {
    const map = mapRef.current;
    if (!map) return;

    map.setView([lat, lon], 15, { animate: true });

    if (markerRef.current) {
      markerRef.current.remove();
    }
    markerRef.current = L.marker([lat, lon])
      .addTo(map)
      .bindPopup(`<strong>${name}</strong>`)
      .openPopup();

    setResults([]);
  }, []);

  const handleResultClick = useCallback((result: GeoResult) => {
    goToLocation(parseFloat(result.lat), parseFloat(result.lon), result.display_name);
  }, [goToLocation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        goToLocation(pos.coords.latitude, pos.coords.longitude, 'My Location');
      },
      () => setError('Location access denied'),
    );
  }, [goToLocation]);

  return (
    <div className="map-app">
      {/* Search Bar */}
      <div className="map-app__search-bar">
        <div className="map-app__search-row">
          <input
            className="map-app__search-input"
            type="text"
            placeholder="Search address or place…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!ready}
          />
          <button
            className="map-app__search-btn"
            onClick={handleSearch}
            disabled={searching || !query.trim() || !ready}
          >
            {searching ? '…' : '🔍'}
          </button>
          <button
            className="map-app__location-btn"
            onClick={handleMyLocation}
            title="My Location"
            disabled={!ready}
          >
            📍
          </button>
        </div>

        {/* Results dropdown */}
        {results.length > 1 && (
          <div className="map-app__results">
            {results.map((r, i) => (
              <button
                key={i}
                className="map-app__result-item"
                onClick={() => handleResultClick(r)}
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="map-app__error">{error}</div>
        )}
      </div>

      {/* Map Container */}
      <div className="map-app__map-wrapper">
        {!ready && (
          <div className="map-app__loading">Loading map…</div>
        )}
        <div ref={mapContainerRef} className="map-app__map" />
      </div>
    </div>
  );
}
