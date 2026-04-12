import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import api from '../services/api';
import { buildRenderCacheKey, readRenderCache, writeRenderCache } from '../services/renderCache';
import { colors } from '../theme/ui';
import FadeInView from '../components/FadeInView';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const MAP_ACCENT = colors.accent;
const MAP_SUCCESS = colors.success;
const MAP_ACCENT_RGB = '124,169,255';
const MAP_SUCCESS_RGB = '121,200,161';
const MAP_TEXT = colors.text;
const MAP_TEXT_MUTED = colors.textMuted;
const MAP_BORDER = colors.border;
const MAP_WARNING = colors.warning;
const MAP_DANGER = colors.danger;
const MAP_SHADOW_RGB = '127,143,178';
const NEARBY_EVENTS_CACHE_TTL_MS = 75 * 1000;

export default function MapScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [events, setEvents] = useState([]);
  const [radiusKm, setRadiusKm] = useState(5);
  const [loading, setLoading] = useState(true);
  const [refreshingEvents, setRefreshingEvents] = useState(false);
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapBootCoords, setMapBootCoords] = useState(null);
  const webviewRef = useRef(null);

  const getCurrentCoords = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission denied');
    }

    const loc = await Location.getCurrentPositionAsync({});
    return loc.coords;
  };

  const fetchNearbyEvents = async ({ coords, nextRadiusKm, initial = false, preferCache = false }) => {
    if (!coords) return;

    const normalizedRadiusKm = Math.max(1, Math.min(50, Math.round(nextRadiusKm || radiusKm || 5)));
    const cacheKey = buildRenderCacheKey('nearby_events', {
      lat: Number(coords.latitude).toFixed(3),
      lng: Number(coords.longitude).toFixed(3),
      radiusKm: normalizedRadiusKm,
    });

    if (preferCache) {
      const cached = await readRenderCache(cacheKey, NEARBY_EVENTS_CACHE_TTL_MS);
      if (Array.isArray(cached)) {
        setEvents(cached);
        if (initial) {
          setLoading(false);
        }
      }
    }

    if (initial) {
      setLoading(true);
    } else {
      setRefreshingEvents(true);
    }

    try {
      setError(null);
      const res = await api.get('/events/nearby', {
        params: {
          lat: coords.latitude,
          lng: coords.longitude,
          radiusKm: normalizedRadiusKm,
        },
      });

      const data = res.data.data || res.data.events || res.data || [];
      const nextEvents = Array.isArray(data) ? data : [];
      setEvents(nextEvents);
      void writeRenderCache(cacheKey, nextEvents);
    } catch (err) {
      console.error(err);
      if (initial) {
        setError('Could not fetch nearby events');
      }
      setEvents([]);
    } finally {
      if (initial) {
        setLoading(false);
      } else {
        setRefreshingEvents(false);
      }
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const coords = await getCurrentCoords();
        setMapBootCoords({ latitude: coords.latitude, longitude: coords.longitude });
        setLocation(coords);

        await fetchNearbyEvents({
          coords,
          nextRadiusKm: radiusKm,
          initial: true,
          preferCache: true,
        });
      } catch (err) {
        console.error(err);
        setError(err?.message || 'Could not fetch nearby events');
        setEvents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRefreshMap = async () => {
    try {
      const coords = await getCurrentCoords();
      setLocation(coords);

      await fetchNearbyEvents({
        coords,
        nextRadiusKm: radiusKm,
        initial: false,
        preferCache: true,
      });
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Could not refresh nearby events');
    }
  };

  const handleRadiusChangeComplete = async (value) => {
    const normalizedRadiusKm = Math.round(value);
    setRadiusKm(normalizedRadiusKm);

    if (!location) return;

    await fetchNearbyEvents({
      coords: location,
      nextRadiusKm: normalizedRadiusKm,
      initial: false,
      preferCache: true,
    });
  };

  const handleWebViewMessage = (e) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'MAP_READY') {
        setMapReady(true);
        return;
      }
      if (msg.type === 'EVENT_TAPPED') {
        navigation.navigate('EventDetail', { eventId: msg.eventId });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const mapStartCoords = mapBootCoords || location || { latitude: 18.9294, longitude: 73.0174 };

  const markersInjectionScript = useMemo(() => {
    const validEvents = events.filter(
      (event) => Number.isFinite(Number(event.longitude)) && Number.isFinite(Number(event.latitude))
    );

    const markersJS = validEvents.map((event) => `
    var el = document.createElement('div');
    el.innerHTML = \`
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${MAP_ACCENT}"/>
        <circle cx="14" cy="14" r="6" fill="white"/>
      </svg>
    \`;
    el.style.cssText = 'cursor:pointer;width:28px;height:36px;';

    var popup = new mapboxgl.Popup({ offset: 36, closeButton: false, maxWidth: '220px' })
      .setHTML(\`
        <div style="font-family:sans-serif;padding:4px;">
          <div style="font-weight:800;font-size:15px;color:${MAP_TEXT};margin-bottom:4px;">${event.title}</div>
          <div style="color:${MAP_TEXT_MUTED};font-size:12px;margin-bottom:2px;">By ${event.creator_first_name || ''} ${event.creator_last_name || ''}</div>
          <div style="color:${MAP_TEXT_MUTED};font-size:12px;margin-bottom:8px;">👥 ${event.participant_count} going</div>
          <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
            ${event.is_full ? '<span style="background:' + MAP_WARNING + ';color:' + MAP_TEXT + ';padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">Full</span>' : ''}
            ${event.is_expired ? '<span style="background:' + MAP_DANGER + ';color:' + MAP_TEXT + ';padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">Expired</span>' : ''}
          </div>
          <button
            onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:'EVENT_TAPPED',eventId:'${event.id}'}))"
            style="background:${MAP_ACCENT};color:white;border:none;padding:10px 12px;border-radius:10px;width:100%;font-size:13px;font-weight:700;cursor:pointer;">
            View Event →
          </button>
        </div>
      \`);

    var markerRef = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([${event.longitude}, ${event.latitude}])
      .setPopup(popup)
      .addTo(map);
    if (window.__OUTLY_EVENT_MARKERS) {
      window.__OUTLY_EVENT_MARKERS.push(markerRef);
    }
  `).join('\n');

    return `
      if (window.__OUTLY_CLEAR_EVENT_MARKERS) {
        window.__OUTLY_CLEAR_EVENT_MARKERS();
      }
      ${markersJS}
      true;
    `;
  }, [events]);

  const sendMapCommand = useCallback((payload) => {
    if (!webviewRef.current) return;
    webviewRef.current.injectJavaScript(
      `window.__OUTLY_BRIDGE && window.__OUTLY_BRIDGE(${JSON.stringify(payload)}); true;`
    );
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    webviewRef.current?.injectJavaScript(markersInjectionScript);
  }, [mapReady, markersInjectionScript]);

  useEffect(() => {
    if (!mapReady || !location) return;
    sendMapCommand({
      type: 'SET_USER_LOCATION',
      lng: location.longitude,
      lat: location.latitude,
    });
  }, [mapReady, location, sendMapCommand]);

  const html = useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet">
      <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { width: 100vw; height: 100vh; overflow: hidden; }
        #map { width: 100%; height: 100%; }
        #locate-btn {
          position: absolute;
          right: 12px;
          bottom: 108px;
          z-index: 12;
          width: 44px;
          height: 44px;
          border-radius: 22px;
          border: 1px solid ${MAP_BORDER};
          background: white;
          box-shadow: 0 4px 12px rgba(${MAP_SHADOW_RGB},0.22);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        #locate-btn .dot {
          width: 14px;
          height: 14px;
          border-radius: 7px;
          background: ${MAP_ACCENT};
          box-shadow: 0 0 0 4px rgba(${MAP_ACCENT_RGB},0.25);
        }

        .mapboxgl-popup-content {
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 8px 24px rgba(${MAP_SHADOW_RGB},0.2);
          border: 1px solid ${MAP_BORDER};
        }
        .mapboxgl-popup-tip { display: none; }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          70% { transform: scale(2.8); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        .you-dot {
          width: 16px;
          height: 16px;
          background: ${MAP_SUCCESS};
          border-radius: 50%;
          border: 2.5px solid white;
          box-shadow: 0 2px 8px rgba(${MAP_SUCCESS_RGB},0.5);
          position: relative;
          cursor: default;
        }
        .you-dot::after {
          content: '';
          position: absolute;
          top: -6px; left: -6px;
          width: 28px; height: 28px;
          background: rgba(${MAP_SUCCESS_RGB},0.25);
          border-radius: 50%;
          animation: pulse 1.8s ease-out infinite;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <button id="locate-btn" aria-label="Current location">
        <span class="dot"></span>
      </button>
      <script>
        mapboxgl.accessToken = '${MAPBOX_TOKEN}';
        var currentUser = { lng: ${mapStartCoords.longitude}, lat: ${mapStartCoords.latitude} };
        var youMarker = null;
        window.__OUTLY_EVENT_MARKERS = [];

        var map = new mapboxgl.Map({
          container: 'map',
          style: 'mapbox://styles/mapbox/light-v11',
          center: [${mapStartCoords.longitude}, ${mapStartCoords.latitude}],
          zoom: 14.5,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

        function ensureYouMarker() {
          if (!youMarker) {
            var youEl = document.createElement('div');
            youEl.className = 'you-dot';

            youMarker = new mapboxgl.Marker({ element: youEl })
              .setLngLat([currentUser.lng, currentUser.lat])
              .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false })
                .setHTML('<b style="color:${MAP_TEXT};font-family:sans-serif;">You are here</b>'))
              .addTo(map);
          } else {
            youMarker.setLngLat([currentUser.lng, currentUser.lat]);
          }
        }

        function clearEventMarkers() {
          if (!window.__OUTLY_EVENT_MARKERS) return;
          window.__OUTLY_EVENT_MARKERS.forEach(function(marker) {
            if (marker && marker.remove) marker.remove();
          });
          window.__OUTLY_EVENT_MARKERS = [];
        }

        function recenterToUser() {
          if (!currentUser) return;
          map.flyTo({
            center: [currentUser.lng, currentUser.lat],
            zoom: map.getZoom(),
            speed: 1.2,
            essential: true,
          });
        }

        window.__OUTLY_CLEAR_EVENT_MARKERS = clearEventMarkers;

        window.__OUTLY_BRIDGE = function(payload) {
          if (!payload) return;

          if (payload.type === 'SET_USER_LOCATION') {
            var lng = Number(payload.lng);
            var lat = Number(payload.lat);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            currentUser = { lng: lng, lat: lat };
            ensureYouMarker();
            return;
          }
        };

        document.getElementById('locate-btn').addEventListener('click', recenterToUser);

        map.on('load', function() {
          ensureYouMarker();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
        });
      </script>
    </body>
    </html>
  `, [mapStartCoords.latitude, mapStartCoords.longitude]);

  const mapSource = useMemo(() => ({ html }), [html]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Finding events near you...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.errorRefreshBtn} onPress={handleRefreshMap}>
          <Text style={styles.errorRefreshBtnText}>Try Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FadeInView style={styles.radiusCard} delay={80} distance={16} scaleFrom={0.975} float>
        <View style={styles.radiusHeaderRow}>
          <Text style={styles.radiusTitle}>Search Radius</Text>
          <View style={styles.radiusActionsRow}>
            <Text style={styles.radiusValue}>{radiusKm} km</Text>
            <TouchableOpacity
              style={[styles.refreshBtn, refreshingEvents && styles.refreshBtnDisabled]}
              onPress={handleRefreshMap}
              disabled={refreshingEvents}
            >
              <Text style={styles.refreshBtnText}>{refreshingEvents ? '...' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={50}
          step={1}
          value={radiusKm}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accentDeep}
          onValueChange={(value) => setRadiusKm(Math.round(value))}
          onSlidingComplete={handleRadiusChangeComplete}
        />

        <View style={styles.radiusMetaRow}>
          <Text style={styles.radiusMetaText}>1 km</Text>
          <Text style={styles.radiusMetaText}>{events.length} events</Text>
          <Text style={styles.radiusMetaText}>50 km</Text>
        </View>

        {refreshingEvents ? <Text style={styles.refreshText}>Updating nearby events...</Text> : null}
      </FadeInView>

      <WebView
        ref={webviewRef}
        source={mapSource}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleWebViewMessage}
        onLoadStart={() => setMapReady(false)}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1 },
  radiusCard: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    zIndex: 5,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: '#7F8FB2',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  radiusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radiusActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radiusTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  radiusValue: {
    color: colors.accentDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  refreshBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  refreshBtnDisabled: {
    opacity: 0.65,
  },
  refreshBtnText: {
    color: colors.accentDeep,
    fontSize: 11,
    fontWeight: '800',
  },
  slider: {
    width: '100%',
    height: 32,
    marginTop: 2,
  },
  radiusMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radiusMetaText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  refreshText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 6,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 16,
    color: colors.danger,
  },
  errorRefreshBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  errorRefreshBtnText: {
    color: colors.accentDeep,
    fontWeight: '800',
    fontSize: 13,
  },
});