import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Modal, Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApi } from '../services/api';
import FadeInView from '../components/FadeInView';
import { colors, radii, shadow } from '../theme/ui';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const MAP_ACCENT = colors.accent;
const MAP_ACCENT_RGB = '124,169,255';
const MAP_TEXT = colors.text;
const MAP_TEXT_MUTED = colors.textMuted;
const MAP_BORDER = colors.border;
const MAP_SHADOW_RGB = '127,143,178';
const CATEGORIES = ['social', 'music', 'sports', 'food', 'art', 'tech', 'outdoor', 'other'];

export default function CreateEventScreen({ navigation }) {
  const api = useApi();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('social');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [eventDateTime, setEventDateTime] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [androidPickerMode, setAndroidPickerMode] = useState('date');
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

    const parsedMax = maxParticipants.trim() ? Number(maxParticipants) : null;
    if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 1)) {
      Alert.alert('Invalid Capacity', 'Max participants must be a positive number');
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
        maxParticipants: parsedMax,
        eventDateTime: eventDateTime.toISOString(),
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
      <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet">
      <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { width: 100vw; height: 100vh; overflow: hidden; }
        #map { width: 100%; height: 100%; }

        #search-box {
          position: absolute; top: 12px; left: 12px; right: 12px;
          z-index: 10; display: flex; gap: 8px;
        }
        #search-input {
          flex: 1; padding: 11px 14px; border-radius: 12px;
          border: 1px solid ${MAP_BORDER}; font-size: 14px;
          background: #fff; color: ${MAP_TEXT};
          box-shadow: 0 2px 8px rgba(${MAP_SHADOW_RGB},0.16);
          outline: none;
        }
        #search-btn {
          padding: 11px 16px; background: ${MAP_ACCENT}; color: white;
          border: none; border-radius: 12px; font-size: 13px;
          font-weight: 700; box-shadow: 0 2px 8px rgba(${MAP_ACCENT_RGB},0.3);
          cursor: pointer;
        }
        #confirm-btn {
          position: absolute; bottom: 24px; left: 16px; right: 16px;
          z-index: 10; padding: 15px; background: ${MAP_ACCENT};
          color: white; border: none; border-radius: 14px;
          font-size: 16px; font-weight: 700;
          box-shadow: 0 4px 16px rgba(${MAP_ACCENT_RGB},0.38);
          display: none; cursor: pointer;
        }
        #locate-btn {
          position: absolute;
          right: 16px;
          bottom: 96px;
          z-index: 11;
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
        #pin-hint {
          position: absolute; bottom: 24px; left: 16px; right: 16px;
          z-index: 10; padding: 14px; background: white;
          border-radius: 14px; text-align: center;
          font-size: 14px; color: ${MAP_TEXT_MUTED};
          box-shadow: 0 2px 12px rgba(${MAP_SHADOW_RGB},0.16);
          border: 1px solid ${MAP_BORDER};
        }

        .mapboxgl-popup-content {
          border-radius: 14px;
          padding: 12px;
          border: 1px solid ${MAP_BORDER};
          box-shadow: 0 4px 16px rgba(${MAP_SHADOW_RGB},0.18);
        }
        .mapboxgl-popup-tip { display: none; }
      </style>
    </head>
    <body>
      <div id="search-box">
        <input id="search-input" type="text" placeholder="Search a place..." />
        <button id="search-btn" onclick="searchPlace()">Go</button>
      </div>
      <div id="map"></div>
      <button id="locate-btn" aria-label="Current location">
        <span class="dot"></span>
      </button>
      <div id="pin-hint">📍 Tap anywhere on the map to drop a pin</div>
      <button id="confirm-btn" onclick="confirmLocation()">Confirm This Location ✓</button>

      <script>
        mapboxgl.accessToken = '${MAPBOX_TOKEN}';

        var map = new mapboxgl.Map({
          container: 'map',
          style: 'mapbox://styles/mapbox/light-v11',
          center: [${mapCenter.lng}, ${mapCenter.lat}],
          zoom: 14,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

        var marker = null;
        var pickedLabel = '';
        var myLocation = { lat: ${mapCenter.lat}, lng: ${mapCenter.lng} };

        map.on('click', function(e) {
          placeMarker(e.lngLat.lng, e.lngLat.lat, '');
        });

        function placeMarker(lng, lat, label) {
          if (marker) marker.remove();
          marker = new mapboxgl.Marker({ color: '${MAP_ACCENT}' })
            .setLngLat([lng, lat])
            .addTo(map);
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
              if (!results.length) {
                alert('Place not found. Try a different name.');
                return;
              }
              var place = results[0];
              var lat = parseFloat(place.lat);
              var lng = parseFloat(place.lon);
              map.flyTo({ center: [lng, lat], zoom: 16, speed: 1.4 });
              placeMarker(lng, lat, place.display_name.split(',').slice(0, 2).join(','));
            })
            .catch(() => alert('Search failed. Check your connection.'));
        }

        function confirmLocation() {
          if (!marker) return;
          var lngLat = marker.getLngLat();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LOCATION_PICKED',
            lat: lngLat.lat,
            lng: lngLat.lng,
            label: pickedLabel,
          }));
        }

        function recenterToMyLocation() {
          map.flyTo({
            center: [myLocation.lng, myLocation.lat],
            zoom: map.getZoom(),
            speed: 1.2,
            essential: true,
          });
        }

        document.getElementById('search-input').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') searchPlace();
        });
        document.getElementById('locate-btn').addEventListener('click', recenterToMyLocation);
      </script>
    </body>
    </html>
  `;

  const formatDateTime = (date) => {
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const onEventDateValueChange = (_, selectedDate) => {
    if (selectedDate) {
      if (Platform.OS === 'android') {
        if (androidPickerMode === 'date') {
          const next = new Date(eventDateTime);
          next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
          setEventDateTime(next);
          setAndroidPickerMode('time');
          return;
        }
        const next = new Date(eventDateTime);
        next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        setEventDateTime(next);
      } else {
        setEventDateTime(selectedDate);
      }
    }
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      setAndroidPickerMode('date');
    }
  };

  const onEventDateDismiss = () => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      setAndroidPickerMode('date');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled"
         contentContainerStyle={{ paddingBottom: 60 }}>

        <FadeInView style={styles.header} delay={40} distance={12} scaleFrom={0.985}>
          <Text style={styles.headerTitle}>Create Event</Text>
          <Text style={styles.headerSub}>Host something meaningful around you.</Text>
        </FadeInView>

        <FadeInView style={styles.form} delay={140} distance={18} scaleFrom={0.98}>
          <View style={styles.field}>
            <Text style={styles.label}>Event Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Rooftop Jam Session"
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
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
            <Text style={styles.label}>Event Date & Time</Text>
            <TouchableOpacity
              style={styles.locationBtn}
              onPress={() => {
                if (Platform.OS === 'android') setAndroidPickerMode('date');
                setShowDatePicker(true);
              }}
            >
              <Text style={styles.locationBtnText}>🗓️ {formatDateTime(eventDateTime)}</Text>
            </TouchableOpacity>
            {showDatePicker ? (
              <DateTimePicker
                value={eventDateTime}
                mode={Platform.OS === 'android' ? androidPickerMode : 'datetime'}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onValueChange={onEventDateValueChange}
                onDismiss={onEventDateDismiss}
              />
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Max Participants (Optional)</Text>
            <TextInput
              style={styles.input}
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              placeholder="e.g. 25"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
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
        </FadeInView>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    padding: 24,
    paddingTop: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSub: {
    color: colors.textMuted,
    fontSize: 14,
  },
  form: {
    padding: 16,
    margin: 16,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  field: { marginBottom: 20 },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  catText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  catTextActive: { color: colors.accentDeep, fontWeight: '800' },
  locationBtn: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  locationBtnText: {
    color: colors.accentDeep,
    fontSize: 15,
    fontWeight: '700',
  },
  locationPicked: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.success,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationPickedText: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  changeLocation: {
    color: colors.accentDeep,
    fontWeight: '800',
    fontSize: 14,
  },
  createBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    ...shadow.lift,
  },
  createBtnDisabled: { backgroundColor: colors.textMuted },
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
    backgroundColor: colors.accent,
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