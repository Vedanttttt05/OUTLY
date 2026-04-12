import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView, Alert
} from 'react-native';
import { useApi } from '../services/api';

export default function EventDetailScreen({ route, navigation }) {
  const api = useApi();
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    fetchEvent();
  }, []);

  const fetchEvent = async () => {
    try {
      const res = await api.get(`/events/${eventId}`);
      const data = res.data.data || res.data;
      setEvent(data);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not load event');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      await api.post(`/events/${eventId}/join`);
      setJoined(true);
      setEvent(prev => ({ ...prev, participant_count: String(Number(prev.participant_count) + 1) }));
      Alert.alert('Joined!', 'You are now going to this event 🎉');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not join event');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    setJoining(true);
    try {
      await api.post(`/events/${eventId}/leave`);
      setJoined(false);
      setEvent(prev => ({ ...prev, participant_count: String(Math.max(0, Number(prev.participant_count) - 1)) }));
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not leave event');
    } finally {
      setJoining(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Date TBD';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.category}>{event.category?.toUpperCase() || 'EVENT'}</Text>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.meta}>👥 {event.participant_count} going</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.icon}>📅</Text>
          <View>
            <Text style={styles.label}>Starts</Text>
            <Text style={styles.value}>{formatDate(event.starts_at)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.icon}>🏁</Text>
          <View>
            <Text style={styles.label}>Ends</Text>
            <Text style={styles.value}>{formatDate(event.ends_at)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.icon}>📍</Text>
          <View>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.value}>{event.latitude?.toFixed(4)}, {event.longitude?.toFixed(4)}</Text>
          </View>
        </View>
      </View>

      {event.description && (
        <View style={styles.card}>
          <Text style={styles.label}>About</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      )}

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.joinBtn, joined && styles.leaveBtn]}
          onPress={joined ? handleLeave : handleJoin}
          disabled={joining}
        >
          {joining
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.joinText}>{joined ? 'Leave Event' : 'Join Event'}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chatBtn}
          onPress={() => navigation.navigate('Chat', { eventId, eventTitle: event.title })}
        >
          <Text style={styles.chatText}>💬 Open Chat</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#e74c3c' },
  header: {
    backgroundColor: '#6C63FF',
    padding: 24,
    paddingTop: 48,
  },
  category: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  meta: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  icon: { fontSize: 20 },
  label: { fontSize: 12, color: '#888', marginBottom: 2 },
  value: { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#f0f0f0' },
  description: { fontSize: 15, color: '#444', lineHeight: 22, marginTop: 8 },
  buttons: { padding: 16, gap: 12, marginTop: 8 },
  joinBtn: {
    backgroundColor: '#6C63FF',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  leaveBtn: { backgroundColor: '#e74c3c' },
  joinText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chatBtn: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#6C63FF',
  },
  chatText: { color: '#6C63FF', fontSize: 16, fontWeight: '700' },
});