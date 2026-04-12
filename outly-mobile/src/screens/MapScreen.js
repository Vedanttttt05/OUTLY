import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import api from '../services/api';

export default function MapScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const webviewRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Location permission denied');
          setLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);

        const res = await api.get('/events/nearby', {
          params: {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            radius: 5000,
          },
        });

        const data = res.data.data || res.data.events || res.data || [];
        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleWebViewMessage = (e) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'EVENT_TAPPED') {
        navigation.navigate('EventDetail', { eventId: msg.eventId });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>Finding events near you...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const markersJS = events.map((event) => `
    var marker = L.marker([${event.latitude}, ${event.longitude}], {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:#6C63FF;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
    }).addTo(map);

    marker.bindPopup(\`
      <div style="font-family:sans-serif;min-width:160px">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">${event.title}</div>
        <div style="color:#666;font-size:12px;margin-bottom:8px">${event.participant_count} going</div>
        <button onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:'EVENT_TAPPED',eventId:'${event.id}'}))"
          style="background:#6C63FF;color:white;border:none;padding:8px 12px;border-radius:8px;width:100%;font-size:13px;font-weight:600;cursor:pointer">
          View Event →
        </button>
      </div>
    \`);
  `).join('\n');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; }
        #map { width: 100vw; height: 100vh; }
        .leaflet-popup-content { margin: 12px; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map').setView([${location.latitude}, ${location.longitude}], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        L.circleMarker([${location.latitude}, ${location.longitude}], {
          radius: 10,
          fillColor: '#6C63FF',
          color: '#fff',
          weight: 2,
          fillOpacity: 1
        }).addTo(map).bindPopup('You are here');

        ${markersJS}
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleWebViewMessage}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#6C63FF" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
  },
  errorText: {
    fontSize: 16,
    color: '#e74c3c',
  },
});