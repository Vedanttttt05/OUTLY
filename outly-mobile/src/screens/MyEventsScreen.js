import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApi } from '../services/api';
import { buildRenderCacheKey, readRenderCache, writeRenderCache } from '../services/renderCache';
import FadeInView from '../components/FadeInView';
import { colors, radii, shadow } from '../theme/ui';

const MY_EVENTS_CACHE_TTL_MS = 2 * 60 * 1000;

export default function MyEventsScreen({ navigation }) {
  const api = useApi();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const myEventsCacheKey = useMemo(() => buildRenderCacheKey('my_events'), []);

  const fetchMyEvents = useCallback(async ({ preferCache = false } = {}) => {
    if (preferCache) {
      const cached = await readRenderCache(myEventsCacheKey, MY_EVENTS_CACHE_TTL_MS);
      if (Array.isArray(cached)) {
        setEvents(cached);
        setLoading(false);
      }
    }

    try {
      const res = await api.get('/events/mine');
      const data = res.data.data || res.data || [];
      const nextEvents = Array.isArray(data) ? data : [];
      setEvents(nextEvents);
      void writeRenderCache(myEventsCacheKey, nextEvents);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, myEventsCacheKey]);

  useFocusEffect(
    useCallback(() => {
      void fetchMyEvents({ preferCache: true });
    }, [fetchMyEvents])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchMyEvents({ preferCache: false });
  }, [fetchMyEvents]);

  const onOpenEventDetail = useCallback((eventId) => {
    navigation.navigate('EventDetail', { eventId });
  }, [navigation]);

  const onOpenChat = useCallback((eventId, eventTitle) => {
    navigation.navigate('Chat', { eventId, eventTitle });
  }, [navigation]);

  const renderEvent = useCallback(({ item, index }) => (
    <FadeInView
      delay={80 + Math.min(index * 55, 320)}
      distance={16}
      duration={560}
      scaleFrom={0.985}
      float={index === 0}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={() => onOpenEventDetail(item.id)}
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
          <TouchableOpacity onPress={() => onOpenChat(item.id, item.title)}>
            <Text style={styles.chatBtn}>💬 Open Chat</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </FadeInView>
  ), [onOpenChat, onOpenEventDetail]);

  const keyExtractor = useCallback((item) => String(item.id), []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Events</Text>
        <Text style={styles.headerSub}>Everything you are hosting or attending.</Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🗓️</Text>
          <Text style={styles.emptyText}>No events yet</Text>
          <Text style={styles.emptySubText}>Join or create an event from the map</Text>
        </View>
      ) : (
        <FadeInView style={{ flex: 1 }}>
          <FlatList
            data={events}
            keyExtractor={keyExtractor}
            renderItem={renderEvent}
            contentContainerStyle={styles.list}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            removeClippedSubviews={true}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
          />
        </FadeInView>
      )}
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
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSub: {
    color: colors.textMuted,
    fontSize: 14,
  },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  categoryText: {
    color: colors.accentDeep,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  participants: {
    color: colors.textMuted,
    fontSize: 13,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 4,
  },
  chatBtn: {
    color: colors.accentDeep,
    fontWeight: '800',
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
    fontWeight: '800',
    color: colors.text,
  },
  emptySubText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});