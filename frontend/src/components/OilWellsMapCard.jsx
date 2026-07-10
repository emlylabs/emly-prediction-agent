import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

const API_BASE = '/emly/api/prediction';
const PAGE_SIZE = 500;
const MAX_FETCH_ROWS = 3000;
const MAX_RENDER_POINTS = 1200;
const DEFAULT_MAP_OPTIONS = {
  map_type_id: 'terrain',
  zoom: 5,
  min_zoom: 2,
  max_zoom: 20,
  tilt: 0,
  heading: 0,
  auto_fit_bounds: true,
  center_lat: 31.9686,
  center_lng: -99.9018,
  gesture_handling: 'auto',
  draggable: true,
  scrollwheel: true,
  disable_default_ui: false,
  zoom_control: true,
  map_type_control: true,
  street_view_control: false,
  fullscreen_control: true,
  show_labels: false,
  max_render_points: 1200,
  marker_size: 28,
  marker_shape: 'oil_rig',
  use_advanced_markers: true,
};

let mapsLoaderPromise = null;

const escapeHtml = (value) => (
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
);

const formatCellValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const buildWellDetailsHtml = (row) => {
  const entries = Object.entries(row || {}).filter(([key]) => {
    const low = String(key || '').trim().toLowerCase();
    return low !== 'row_index' && low !== '__row_index' && low !== '_row_index';
  });

  const rowsHtml = entries
    .map(([key, value]) => (
      `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-weight:600;color:#0f172a;">${escapeHtml(key)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#334155;word-break:break-word;">${escapeHtml(formatCellValue(value))}</td>
      </tr>`
    ))
    .join('');

  return `
    <div style="min-width:260px;max-width:420px;">
      <div style="font-weight:700;color:#0f172a;margin-bottom:8px;">Well Details</div>
      <div style="max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;">
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          <tbody>${rowsHtml || '<tr><td style="padding:8px;">No row details available.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
};

function loadGoogleMapsApi(apiKey) {
  if (window.google?.maps) {
    const mapsApi = window.google.maps;
    if (typeof mapsApi.importLibrary === 'function') {
      return Promise.all([mapsApi.importLibrary('maps'), mapsApi.importLibrary('marker')]).then(() => window.google.maps);
    }
    return Promise.resolve(mapsApi);
  }
  if (mapsLoaderPromise) return mapsLoaderPromise;

  mapsLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=marker&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = async () => {
      try {
        const mapsApi = window.google?.maps;
        if (!mapsApi) throw new Error('Google Maps API did not initialize.');

        // Ensure core map constructors are ready before resolving.
        if (typeof mapsApi.importLibrary === 'function') {
          await mapsApi.importLibrary('maps');
          await mapsApi.importLibrary('marker');
        }

        resolve(window.google.maps);
      } catch (err) {
        mapsLoaderPromise = null;
        reject(err instanceof Error ? err : new Error('Failed to initialize Google Maps libraries.'));
      }
    };
    script.onerror = () => {
      mapsLoaderPromise = null;
      reject(new Error('Failed to load Google Maps API.'));
    };
    document.head.appendChild(script);
  });

  return mapsLoaderPromise;
}

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeGaugeStatus = (value) => {
  if (value === 1 || value === '1' || value === true) return 'active';
  if (value === 0 || value === '0' || value === false) return 'defunct';
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (['active', 'online', 'working', 'healthy', 'ok', 'good', 'available'].includes(raw)) return 'active';
  if (['defunct', 'inactive', 'offline', 'failed', 'down', 'bad', 'dead'].includes(raw)) return 'defunct';
  if (raw.includes('active')) return 'active';
  if (raw.includes('defunct') || raw.includes('inactive') || raw.includes('fail')) return 'defunct';
  return raw;
};

const getGaugeStatusFromRow = (row, gaugeStatusColumn = 'gauge_status') => {
  if (!row || typeof row !== 'object') return '';
  if (gaugeStatusColumn && row[gaugeStatusColumn] != null) {
    return normalizeGaugeStatus(row[gaugeStatusColumn]);
  }
  if (row.gauge_status != null) return normalizeGaugeStatus(row.gauge_status);

  const match = Object.entries(row).find(([key]) => {
    const normalizedKey = String(key || '').trim().toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    return normalizedKey === 'gaugestatus';
  });
  return normalizeGaugeStatus(match?.[1]);
};

const getGaugeMarkerColor = (gaugeStatus) => {
  if (gaugeStatus === 'active') return '#16a34a';
  if (gaugeStatus === 'defunct') return '#dc2626';
  return '#0f172a';
};

const markerIconCache = new Map();

const getMarkerIconUrl = (shape, markerColor, size = 28) => {
  const normalizedSize = Math.max(8, Math.min(64, Number(size) || 28));
  const key = `${shape}|${markerColor}|${normalizedSize}`;
  if (markerIconCache.has(key)) return markerIconCache.get(key);
  const center = normalizedSize / 2;
  const inset = Math.max(1, Math.round(normalizedSize * 0.08));
  const outer = center - inset;

  const shapeMarkupByType = {
    oil_rig: `
      <circle cx="${center}" cy="${center}" r="${outer}" fill="${markerColor}" />
      <path d="M${normalizedSize * 0.285} ${normalizedSize * 0.785}h${normalizedSize * 0.43}v${normalizedSize * 0.075}h-${normalizedSize * 0.43}v-${normalizedSize * 0.075}Zm${normalizedSize * 0.085}-${normalizedSize * 0.075}h${normalizedSize * 0.26}l-${normalizedSize * 0.035}-${normalizedSize * 0.285}h${normalizedSize * 0.055}l-${normalizedSize * 0.065}-${normalizedSize * 0.18}h${normalizedSize * 0.045}L${center} ${normalizedSize * 0.145}l-${normalizedSize * 0.12} ${normalizedSize * 0.11}h${normalizedSize * 0.045}l-${normalizedSize * 0.065} ${normalizedSize * 0.18}h${normalizedSize * 0.055}l-${normalizedSize * 0.035} ${normalizedSize * 0.285}Zm${normalizedSize * 0.185}-${normalizedSize * 0.275}h${normalizedSize * 0.035}l${normalizedSize * 0.02} ${normalizedSize * 0.205}h-${normalizedSize * 0.08}l${normalizedSize * 0.02}-${normalizedSize * 0.205}Z" fill="#ffffff"/>
    `,
    pin: `
      <path d="M${center} ${inset}c${outer * 0.65} 0 ${outer} ${outer * 0.57} ${outer} ${outer * 1.25} 0 ${outer * 0.8}-${outer * 1.05} ${outer * 1.65}-${outer} ${outer * 2.45}-${outer * 0.95}-${outer * 0.8}-${outer} -${outer * 1.65}-${outer} -${outer * 2.45} 0-${outer * 0.68} ${outer * 0.35}-${outer * 1.25} ${outer}-${outer * 1.25}Z" fill="${markerColor}" />
      <circle cx="${center}" cy="${center + outer * 0.1}" r="${Math.max(2, outer * 0.36)}" fill="#ffffff" />
    `,
    circle: `<circle cx="${center}" cy="${center}" r="${outer}" fill="${markerColor}" />`,
    square: `<rect x="${inset}" y="${inset}" width="${normalizedSize - inset * 2}" height="${normalizedSize - inset * 2}" rx="${Math.max(1, inset)}" fill="${markerColor}" />`,
    diamond: `<polygon points="${center},${inset} ${normalizedSize - inset},${center} ${center},${normalizedSize - inset} ${inset},${center}" fill="${markerColor}" />`,
    triangle: `<polygon points="${center},${inset} ${normalizedSize - inset},${normalizedSize - inset} ${inset},${normalizedSize - inset}" fill="${markerColor}" />`,
    star: `<path d="M${center} ${inset} L${center + outer * 0.23} ${center - outer * 0.1} L${normalizedSize - inset} ${center - outer * 0.05} L${center + outer * 0.35} ${center + outer * 0.2} L${center + outer * 0.5} ${normalizedSize - inset} L${center} ${center + outer * 0.35} L${center - outer * 0.5} ${normalizedSize - inset} L${center - outer * 0.35} ${center + outer * 0.2} L${inset} ${center - outer * 0.05} L${center - outer * 0.23} ${center - outer * 0.1} Z" fill="${markerColor}" />`,
    car: `
      <rect x="${normalizedSize * 0.17}" y="${normalizedSize * 0.46}" width="${normalizedSize * 0.66}" height="${normalizedSize * 0.26}" rx="${normalizedSize * 0.06}" fill="${markerColor}" />
      <path d="M${normalizedSize * 0.29} ${normalizedSize * 0.46} L${normalizedSize * 0.39} ${normalizedSize * 0.31} H${normalizedSize * 0.62} L${normalizedSize * 0.73} ${normalizedSize * 0.46} Z" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.41}" y="${normalizedSize * 0.34}" width="${normalizedSize * 0.19}" height="${normalizedSize * 0.09}" rx="${normalizedSize * 0.02}" fill="#ffffff" />
      <circle cx="${normalizedSize * 0.34}" cy="${normalizedSize * 0.75}" r="${normalizedSize * 0.08}" fill="#0f172a" />
      <circle cx="${normalizedSize * 0.66}" cy="${normalizedSize * 0.75}" r="${normalizedSize * 0.08}" fill="#0f172a" />
    `,
    human: `
      <circle cx="${center}" cy="${normalizedSize * 0.25}" r="${normalizedSize * 0.11}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.42}" y="${normalizedSize * 0.37}" width="${normalizedSize * 0.16}" height="${normalizedSize * 0.27}" rx="${normalizedSize * 0.05}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.29}" y="${normalizedSize * 0.40}" width="${normalizedSize * 0.12}" height="${normalizedSize * 0.08}" rx="${normalizedSize * 0.03}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.59}" y="${normalizedSize * 0.40}" width="${normalizedSize * 0.12}" height="${normalizedSize * 0.08}" rx="${normalizedSize * 0.03}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.40}" y="${normalizedSize * 0.64}" width="${normalizedSize * 0.08}" height="${normalizedSize * 0.22}" rx="${normalizedSize * 0.03}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.52}" y="${normalizedSize * 0.64}" width="${normalizedSize * 0.08}" height="${normalizedSize * 0.22}" rx="${normalizedSize * 0.03}" fill="${markerColor}" />
    `,
    truck: `
      <rect x="${normalizedSize * 0.12}" y="${normalizedSize * 0.43}" width="${normalizedSize * 0.48}" height="${normalizedSize * 0.24}" rx="${normalizedSize * 0.03}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.60}" y="${normalizedSize * 0.49}" width="${normalizedSize * 0.22}" height="${normalizedSize * 0.18}" rx="${normalizedSize * 0.03}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.64}" y="${normalizedSize * 0.52}" width="${normalizedSize * 0.11}" height="${normalizedSize * 0.07}" rx="${normalizedSize * 0.02}" fill="#ffffff" />
      <circle cx="${normalizedSize * 0.30}" cy="${normalizedSize * 0.73}" r="${normalizedSize * 0.08}" fill="#0f172a" />
      <circle cx="${normalizedSize * 0.67}" cy="${normalizedSize * 0.73}" r="${normalizedSize * 0.08}" fill="#0f172a" />
    `,
    home: `
      <polygon points="${center},${normalizedSize * 0.18} ${normalizedSize * 0.82},${normalizedSize * 0.45} ${normalizedSize * 0.18},${normalizedSize * 0.45}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.24}" y="${normalizedSize * 0.45}" width="${normalizedSize * 0.52}" height="${normalizedSize * 0.35}" rx="${normalizedSize * 0.03}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.44}" y="${normalizedSize * 0.58}" width="${normalizedSize * 0.12}" height="${normalizedSize * 0.22}" rx="${normalizedSize * 0.02}" fill="#ffffff" />
    `,
    hospital: `
      <rect x="${normalizedSize * 0.20}" y="${normalizedSize * 0.20}" width="${normalizedSize * 0.60}" height="${normalizedSize * 0.60}" rx="${normalizedSize * 0.06}" fill="${markerColor}" />
      <rect x="${normalizedSize * 0.45}" y="${normalizedSize * 0.30}" width="${normalizedSize * 0.10}" height="${normalizedSize * 0.40}" fill="#ffffff" />
      <rect x="${normalizedSize * 0.30}" y="${normalizedSize * 0.45}" width="${normalizedSize * 0.40}" height="${normalizedSize * 0.10}" fill="#ffffff" />
    `,
  };

  const shapeMarkup = shapeMarkupByType[shape] || shapeMarkupByType.oil_rig;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${normalizedSize}" height="${normalizedSize}" viewBox="0 0 ${normalizedSize} ${normalizedSize}">${shapeMarkup}</svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  markerIconCache.set(key, url);
  return url;
};

const getAutoLatColumn = (columns) => {
  const ranked = (columns || []).map((name) => ({
    name,
    low: String(name || '').trim().toLowerCase(),
  }));

  const exact = ranked.find((c) => c.low === 'latitude' || c.low === 'lat');
  if (exact) return exact.name;

  const contains = ranked.find((c) => c.low.includes('latitude') || c.low.includes('lat'));
  return contains?.name || '';
};

const getAutoLonColumn = (columns) => {
  const ranked = (columns || []).map((name) => ({
    name,
    low: String(name || '').trim().toLowerCase(),
  }));

  const exact = ranked.find((c) => c.low === 'longitude' || c.low === 'lon' || c.low === 'lng' || c.low === 'long');
  if (exact) return exact.name;

  const contains = ranked.find((c) => (
    c.low.includes('longitude') || c.low.includes('lon') || c.low.includes('lng') || c.low.includes('long')
  ));
  return contains?.name || '';
};

function OilWellsMapCard({
  datasets,
  selectedDatasetId = '',
  latitudeColumn = '',
  longitudeColumn = '',
  mapOptions = DEFAULT_MAP_OPTIONS,
}) {
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState('');
  const [mapApiKey, setMapApiKey] = useState('');
  const [mapId, setMapId] = useState('');
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState('');

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  const effectiveDatasetId = selectedDatasetId || datasets?.[0]?.dataset_id || '';

  const selectedDataset = useMemo(
    () => (datasets || []).find((ds) => ds.dataset_id === effectiveDatasetId) || null,
    [datasets, effectiveDatasetId]
  );

  const datasetColumns = useMemo(() => selectedDataset?.columns || [], [selectedDataset]);
  const effectiveLatColumn = latitudeColumn || getAutoLatColumn(datasetColumns);
  const effectiveLonColumn = longitudeColumn || getAutoLonColumn(datasetColumns);
  const finalMapOptions = useMemo(
    () => ({ ...DEFAULT_MAP_OPTIONS, ...(mapOptions || {}) }),
    [mapOptions]
  );

  useEffect(() => {
    const loadFrontendConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/frontend-config`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || 'Failed to load frontend config');
        setMapApiKey(String(body.google_maps_api_key || '').trim());
        setMapId(String(body.google_maps_map_id || '').trim());
      } catch {
        setMapApiKey('');
        setMapId('');
      }
    };

    loadFrontendConfig().catch(() => {});
  }, []);

  useEffect(() => {
    if (!effectiveDatasetId) {
      setRows([]);
      return;
    }

    const loadRows = async () => {
      setLoadingRows(true);
      setRowsError('');
      try {
        const startRes = await fetch(`${API_BASE}/prepare/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: effectiveDatasetId }),
        });
        const startBody = await startRes.json();
        if (!startRes.ok) throw new Error(startBody.detail || 'Failed to open dataset session for map');

        const { session_id: sessionId, total_rows: totalRowsHint } = startBody;
        let offset = 0;
        let aggregated = [];
        const totalRows = Number(totalRowsHint || 0);

        while (offset < MAX_FETCH_ROWS) {
          const tableRes = await fetch(`${API_BASE}/prepare/${sessionId}/table?limit=${PAGE_SIZE}&offset=${offset}`);
          const tableBody = await tableRes.json();
          if (!tableRes.ok) throw new Error(tableBody.detail || 'Failed to fetch dataset rows');

          const pageRows = Array.isArray(tableBody.rows) ? tableBody.rows : [];
          aggregated = aggregated.concat(pageRows);
          offset += pageRows.length;

          if (!pageRows.length) break;
          if (pageRows.length < PAGE_SIZE) break;
          if (totalRows && offset >= totalRows) break;
          if (offset >= MAX_FETCH_ROWS) break;
        }

        setRows(aggregated);
      } catch (err) {
        setRows([]);
        setRowsError(err.message || 'Failed to load dataset rows');
      } finally {
        setLoadingRows(false);
      }
    };

    loadRows().catch(() => {});
  }, [effectiveDatasetId]);

  useEffect(() => {
    if (!mapApiKey) {
      setMapsReady(false);
      setMapsError('');
      return;
    }

    let cancelled = false;
    setMapsError('');
    loadGoogleMapsApi(mapApiKey)
      .then(() => {
        if (cancelled) return;
        setMapsReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setMapsReady(false);
        setMapsError(err.message || 'Failed to load Google Maps API');
      });

    return () => {
      cancelled = true;
    };
  }, [mapApiKey]);

  const points = useMemo(() => {
    if (!effectiveLatColumn || !effectiveLonColumn) return [];
    const cleaned = rows
      .map((row) => {
        const lat = toNumber(row?.[effectiveLatColumn]);
        const lng = toNumber(row?.[effectiveLonColumn]);
        if (lat == null || lng == null) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        const gaugeStatus = getGaugeStatusFromRow(row, 'gauge_status');
        return { lat, lng, row, gaugeStatus };
      })
      .filter(Boolean);

    const maxPoints = Math.max(1, Number(finalMapOptions.max_render_points) || MAX_RENDER_POINTS);
    return cleaned.slice(0, maxPoints);
  }, [rows, effectiveLatColumn, effectiveLonColumn, finalMapOptions.max_render_points]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;

    const googleMaps = window.google.maps;
    const MapCtor = googleMaps?.Map;
    if (typeof MapCtor !== 'function') {
      // Transient state: loader is ready but constructor may not be attached yet.
      return;
    }
    if (mapsError) setMapsError('');

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new MapCtor(mapRef.current, {
        center: {
          lat: Number(finalMapOptions.center_lat) || 31.9686,
          lng: Number(finalMapOptions.center_lng) || -99.9018,
        },
        zoom: Math.max(0, Number(finalMapOptions.zoom) || 5),
        minZoom: Math.max(0, Number(finalMapOptions.min_zoom) || 2),
        maxZoom: Math.max(0, Number(finalMapOptions.max_zoom) || 20),
        mapTypeId: finalMapOptions.map_type_id || 'terrain',
        tilt: Math.max(0, Number(finalMapOptions.tilt) || 0),
        heading: Math.max(0, Number(finalMapOptions.heading) || 0),
        gestureHandling: finalMapOptions.gesture_handling || 'auto',
        draggable: Boolean(finalMapOptions.draggable),
        scrollwheel: Boolean(finalMapOptions.scrollwheel),
        disableDefaultUI: Boolean(finalMapOptions.disable_default_ui),
        zoomControl: Boolean(finalMapOptions.zoom_control),
        mapTypeControl: Boolean(finalMapOptions.map_type_control),
        streetViewControl: Boolean(finalMapOptions.street_view_control),
        fullscreenControl: Boolean(finalMapOptions.fullscreen_control),
        ...(mapId ? { mapId } : {}),
        styles: finalMapOptions.show_labels ? [] : [{ elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      });
    } else {
      mapInstanceRef.current.setOptions({
        center: {
          lat: Number(finalMapOptions.center_lat) || 31.9686,
          lng: Number(finalMapOptions.center_lng) || -99.9018,
        },
        zoom: Math.max(0, Number(finalMapOptions.zoom) || 5),
        minZoom: Math.max(0, Number(finalMapOptions.min_zoom) || 2),
        maxZoom: Math.max(0, Number(finalMapOptions.max_zoom) || 20),
        mapTypeId: finalMapOptions.map_type_id || 'terrain',
        tilt: Math.max(0, Number(finalMapOptions.tilt) || 0),
        heading: Math.max(0, Number(finalMapOptions.heading) || 0),
        gestureHandling: finalMapOptions.gesture_handling || 'auto',
        draggable: Boolean(finalMapOptions.draggable),
        scrollwheel: Boolean(finalMapOptions.scrollwheel),
        disableDefaultUI: Boolean(finalMapOptions.disable_default_ui),
        zoomControl: Boolean(finalMapOptions.zoom_control),
        mapTypeControl: Boolean(finalMapOptions.map_type_control),
        streetViewControl: Boolean(finalMapOptions.street_view_control),
        fullscreenControl: Boolean(finalMapOptions.fullscreen_control),
        styles: finalMapOptions.show_labels ? [] : [{ elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      });
    }

    if (!infoWindowRef.current) {
      infoWindowRef.current = new googleMaps.InfoWindow();
    }

    markersRef.current.forEach((markerEntry) => {
      if (typeof markerEntry?.remove === 'function') markerEntry.remove();
    });
    markersRef.current = [];

    if (!points.length) return;

    const bounds = new googleMaps.LatLngBounds();
    const AdvancedMarkerElement = googleMaps?.marker?.AdvancedMarkerElement;
    const PinElement = googleMaps?.marker?.PinElement;
    const markerShape = String(finalMapOptions.marker_shape || 'oil_rig');
    const canUseAdvancedMarkers = Boolean(
      mapId
      && Boolean(finalMapOptions.use_advanced_markers)
      && AdvancedMarkerElement
      && PinElement
    );
    const markerSize = Math.max(8, Math.min(64, Number(finalMapOptions.marker_size) || 28));

    points.forEach((point) => {
      bounds.extend(point);
      const position = { lat: point.lat, lng: point.lng };
      const color = getGaugeMarkerColor(point.gaugeStatus);

      if (canUseAdvancedMarkers) {
        let markerContent = null;
        if (markerShape === 'pin') {
          markerContent = new PinElement({
            background: color,
            borderColor: color,
            glyphColor: '#ffffff',
            scale: Math.max(0.7, markerSize / 28),
          });
        } else {
          const markerImage = document.createElement('img');
          markerImage.src = getMarkerIconUrl(markerShape, color, markerSize);
          markerImage.width = markerSize;
          markerImage.height = markerSize;
          markerImage.style.width = `${markerSize}px`;
          markerImage.style.height = `${markerSize}px`;
          markerImage.alt = '';
          markerContent = markerImage;
        }

        const marker = new AdvancedMarkerElement({
          position,
          map: mapInstanceRef.current,
          content: markerContent,
        });

        const onMarkerClick = () => {
          if (!infoWindowRef.current) return;
          infoWindowRef.current.setContent(buildWellDetailsHtml(point.row));
          infoWindowRef.current.open({
            anchor: marker,
            map: mapInstanceRef.current,
          });
        };
        marker.addEventListener('gmp-click', onMarkerClick);

        markersRef.current.push({
          remove: () => {
            marker.removeEventListener?.('gmp-click', onMarkerClick);
            marker.map = null;
          },
        });
      } else {
        const marker = new googleMaps.Marker({
          position,
          map: mapInstanceRef.current,
          icon: {
            url: getMarkerIconUrl(markerShape, color, markerSize),
            scaledSize: new googleMaps.Size(markerSize, markerSize),
            anchor: new googleMaps.Point(Math.round(markerSize / 2), Math.round(markerSize / 2)),
          },
        });

        const listener = marker.addListener('click', () => {
          if (!infoWindowRef.current) return;
          infoWindowRef.current.setContent(buildWellDetailsHtml(point.row));
          infoWindowRef.current.open({
            anchor: marker,
            map: mapInstanceRef.current,
          });
        });

        markersRef.current.push({
          remove: () => {
            listener?.remove?.();
            marker.setMap(null);
          },
        });
      }
    });

    if (finalMapOptions.auto_fit_bounds) {
      mapInstanceRef.current.fitBounds(bounds);
    }
  }, [mapsReady, points, mapId, finalMapOptions]);

  const canRenderMap = Boolean(mapApiKey && mapsReady && !mapsError);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      {loadingRows ? <p className="text-sm text-slate-500">Loading dataset rows...</p> : null}
      {rowsError ? <p className="text-sm text-red-600">{rowsError}</p> : null}

      {!canRenderMap ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Map is not ready.</p>
          {mapsError ? <p className="mt-1">{mapsError}</p> : <p className="mt-1">Map service is unavailable.</p>}
        </div>
      ) : null}

      {!effectiveDatasetId ? (
        <p className="text-sm text-slate-500">No dataset configured in card settings.</p>
      ) : null}

      {effectiveDatasetId && (!effectiveLatColumn || !effectiveLonColumn) ? (
        <p className="text-sm text-slate-500">Latitude/longitude columns are not configured in card settings.</p>
      ) : null}

      {!points.length && !loadingRows && effectiveDatasetId && effectiveLatColumn && effectiveLonColumn ? (
        <p className="text-sm text-slate-500">No valid latitude/longitude rows found for the selected columns.</p>
      ) : null}

      <div className="well-map-canvas" ref={mapRef} />
    </div>
  );
}

export default OilWellsMapCard;
