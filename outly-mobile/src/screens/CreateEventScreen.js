import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Modal
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useApi } from '../services/api';

const CATEGORIES = ['social', 'music', 'sports', 'food', 'art', 'tech', 'outdoor', 'other'];

export default function CreateEventScreen({ navigation }) {
  const api = useApi();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('social');
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 18.9294, lng: 73.0174 });

  const detectMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setMapCenter({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setShowMapPicker(true);
    } catch (err) {
      setShowMapPicker(true);
    }
  };

  const handleWebViewMessage = (e) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'LOCATION_PICKED') {
        setLocation({ latitude: msg.lat, longitude: msg.lng });
        setLocationLabel(msg.label || `${msg.lat.toFixed(4)}, ${msg.lng.toFixed(4)}`);
        setShowMapPicker(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter an event title');
      return;
    }
    if (!location) {
      Alert.alert('Missing location', 'Please pick a location on the map');
      return;
    }

    setLoading(true);
    try {
      await api.post('/events', {
        title: title.trim(),
        description: description.trim(),
        category,
        lat: location.latitude,
        lng: location.longitude,
      });

      Alert.alert('Event Created! 🎉', 'Your event is now live on the map', [
        { text: 'OK', onPress: () => navigation.navigate('Map') }
      ]);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not create event');
    } finally {
      setLoading(false);
    }
  };

  const mapPickerHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        #map { width: 100vw; height: 100vh; }
        #search-box {
          position: absolute; top: 10px; left: 10px; right: 10px;
          z-index: 1000; display: flex; gap: 6px;
        }
        #search-input {
          flex: 1; padding: 10px 14px; border-radius: 10px;
          border: none; font-size: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        #search-btn {
          padding: 10px 14px; background: #6C63FF; color: white;
          border: none; border-radius: 10px; font-size: 13px;
          font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        #confirm-btn {
          position: absolute; bottom: 24px; left: 16px; right: 16px;
          z-index: 1000; padding: 14px; background: #6C63FF;
          color: white; border: none; border-radius: 12px;
          font-size: 16px; font-weight: 700;
          box-shadow: 0 4px 12px rgba(108,99,255,0.4);
          display: none;
        }
        #pin-hint {
          position: absolute; bottom: 24px; left: 16px; right: 16px;
          z-index: 1000; padding: 14px; background: white;
          border-radius: 12px; text-align: center;
          font-size: 14px; color: #666;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
      </style>
    </head>
    <body>
      <div id="search-box">
        <input id="search-input" type="text" placeholder="Search place e.g. Seawoods Mall..." />
        <button id="search-btn" onclick="searchPlace()">Go</button>
      </div>
      <div id="map"></div>
      <div id="pin-hint">Tap anywhere on the map to drop a pin</div>
      <button id="confirm-btn" onclick="confirmLocation()">Confirm This Location ✓</button>

      <script>
        var map = L.map('map').setView([${mapCenter.lat}, ${mapCenter.lng}], 15);
        var marker = null;
        var pickedLabel = '';

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(map);

        map.on('click', function(e) {
          placeMarker(e.latlng.lat, e.latlng.lng, '');
        });

        function placeMarker(lat, lng, label) {
          if (marker) map.removeLayer(marker);
          marker = L.marker([lat, lng]).addTo(map);
          pickedLabel = label || (lat.toFixed(4) + ', ' + lng.toFixed(4));
          document.getElementById('confirm-btn').style.display = 'block';
          document.getElementById('pin-hint').style.display = 'none';
        }

        function searchPlace() {
          var query = document.getElementById('search-input').value.trim();
          if (!query) return;

          fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query))
            .then(r => r.json())
            .then(results => {
              if (results.length === 0) {
                alert('Place not found. Try a different name.');
                return;
              }
              var place = results[0];
              var lat = parseFloat(place.lat);
              var lng = parseFloat(place.lon);
              map.setView([lat, lng], 17);
              placeMarker(lat, lng, place.display_name.split(',').slice(0,2).join(','));
            })
            .catch(() => alert('Search failed. Check your connection.'));
        }

        function confirmLocation() {
          if (!marker) return;
          var latlng = marker.getLatLng();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LOCATION_PICKED',
            lat: latlng.lat,
            lng: latlng.lng,
            label: pickedLabel
          }));
        }

        document.getElementById('search-input').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') searchPlace();
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create Event</Text>
          <Text style={styles.headerSub}>Host something near you</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Event Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Rooftop Jam Session"
              placeholderTextColor="#aaa"
              maxLength={80}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell people what this event is about..."
              placeholderTextColor="#aaa"
              multiline
              maxLength={300}
              numberOfLines={4}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categories}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, category === cat && styles.catChipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.catText, category === cat && styles.catTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Location *</Text>
            {location ? (
              <View style={styles.locationPicked}>
                <Text style={styles.locationPickedText}>📍 {locationLabel}</Text>
                <TouchableOpacity onPress={() => setShowMapPicker(true)}>
                  <Text style={styles.changeLocation}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.locationBtn} onPress={detectMyLocation}>
                <Text style={styles.locationBtnText}>📍 Pick Location on Map</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.createBtn, loading && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.createBtnText}>Create Event</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showMapPicker} animationType="slide">
        <View style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pick Event Location</Text>
            <TouchableOpacity onPress={() => setShowMapPicker(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ html: mapPickerHTML }}
            style={{ flex: 1 }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={handleWebViewMessage}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#6C63FF',
    padding: 24,
    paddingTop: 52,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  form: { padding: 16 },
  field: { marginBottom: 20 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#eee',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#eee',
  },
  catChipActive: {
    backgroundColor: '#6C63FF',
    borderColor: '#6C63FF',
  },
  catText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  catTextActive: { color: '#fff' },
  locationBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#6C63FF',
    alignItems: 'center',
  },
  locationBtnText: {
    color: '#6C63FF',
    fontSize: 15,
    fontWeight: '600',
  },
  locationPicked: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#2ecc71',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationPickedText: {
    color: '#1a1a1a',
    fontSize: 14,
    flex: 1,
  },
  changeLocation: {
    color: '#6C63FF',
    fontWeight: '700',
    fontSize: 14,
  },
  createBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  createBtnDisabled: { backgroundColor: '#aaa' },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#6C63FF',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalClose: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});