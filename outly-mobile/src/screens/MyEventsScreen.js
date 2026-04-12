import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApi } from '../services/api';

export default function MyEventsScreen({ navigation }) {
  const api = useApi();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyEvents = async () => {
    try {
      const res = await api.get('/events/mine');
      const data = res.data.data || res.data || [];
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchMyEvents();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyEvents();
  };

  const renderEvent = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
    >
      <View style={styles.cardTop}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{item.category || 'social'}</Text>
        </View>
        <Text style={styles.participants}>👥 {item.participant_count || 0}</Text>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      {item.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      <View style={styles.cardBottom}>
        <TouchableOpacity onPress={() => navigation.navigate('Chat', {
          eventId: item.id,
          eventTitle: item.title
        })}>
          <Text style={styles.chatBtn}>💬 Open Chat</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Events</Text>
        <Text style={styles.headerSub}>Events you joined or created</Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🗓️</Text>
          <Text style={styles.emptyText}>No events yet</Text>
          <Text style={styles.emptySubText}>Join or create an event from the map</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
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
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#f0eeff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  categoryText: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  participants: {
    color: '#888',
    fontSize: 13,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
    marginTop: 4,
  },
  chatBtn: {
    color: '#6C63FF',
    fontWeight: '700',
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  emptySubText: {
    fontSize: 14,
    color: '#888',
  },
});