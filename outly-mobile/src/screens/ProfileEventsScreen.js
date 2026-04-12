import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useApi } from '../services/api';
import { buildRenderCacheKey, readRenderCache, writeRenderCache } from '../services/renderCache';
import FadeInView from '../components/FadeInView';
import { colors, radii, shadow } from '../theme/ui';

const PROFILE_EVENTS_CACHE_TTL_MS = 2 * 60 * 1000;

const getPastDaysAgo = (event) => {
  const directValue = Number(event?.days_ago ?? event?.daysAgo);
  if (Number.isFinite(directValue) && directValue >= 0) return Math.floor(directValue);

  const source = event?.expires_at || event?.event_date_time || event?.created_at;
  if (!source) return null;

  const when = new Date(source);
  if (Number.isNaN(when.getTime())) return null;

  const diff = Date.now() - when.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const formatDaysAgoText = (event) => {
  const daysAgo = getPastDaysAgo(event);
  if (daysAgo === null) return 'happened';
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return '1 day ago';
  return `${daysAgo} days ago`;
};

const coerceArray = (value) => (Array.isArray(value) ? value : []);

export default function ProfileEventsScreen({ route, navigation }) {
  const api = useApi();
  const section = route?.params?.section || 'live';
  const targetUserId = route?.params?.userId || null;
  const profileName = route?.params?.profileName || 'Profile';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const profileEventsCacheKey = useMemo(
    () => buildRenderCacheKey('profile_events', { userId: targetUserId || 'me' }),
    [targetUserId]
  );

  const fetchProfileEvents = useCallback(async ({ silent = false, preferCache = false } = {}) => {
    let hydratedFromCache = false;

    if (preferCache) {
      const cached = await readRenderCache(profileEventsCacheKey, PROFILE_EVENTS_CACHE_TTL_MS);
      if (cached && typeof cached === 'object') {
        setProfileData(cached);
        setLoading(false);
        hydratedFromCache = true;
      }
    }

    if (!silent && !hydratedFromCache) {
      setLoading(true);
    }

    try {
      setError(null);
      const path = targetUserId ? `/users/${targetUserId}/profile` : '/users/me/profile';
      const response = await api.get(path);
      const nextData = response?.data?.data || null;
      setProfileData(nextData);
      if (nextData) {
        void writeRenderCache(profileEventsCacheKey, nextData);
      }
    } catch (err) {
      if (!hydratedFromCache) {
        setError(err?.response?.data?.message || 'Could not load events.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [api, profileEventsCacheKey, targetUserId]);

  useEffect(() => {
    void fetchProfileEvents({ preferCache: true });
  }, [fetchProfileEvents]);

  const onRefresh = async () => {
    if (refreshing) return;

    setRefreshing(true);
    try {
      await fetchProfileEvents({ silent: true, preferCache: false });
    } finally {
      setRefreshing(false);
    }
  };

  const liveCreatedEvents = useMemo(() => {
    if (!profileData) return [];
    return coerceArray(profileData.eventsCreatedLive).length
      ? coerceArray(profileData.eventsCreatedLive)
      : coerceArray(profileData.eventsCreated);
  }, [profileData]);

  const pastCreatedEvents = useMemo(() => coerceArray(profileData?.eventsCreatedPast), [profileData]);

  const joinedLiveEvents = useMemo(() => {
    if (!profileData) return [];
    return coerceArray(profileData.eventsJoinedLive).length
      ? coerceArray(profileData.eventsJoinedLive)
      : coerceArray(profileData.eventsJoined);
  }, [profileData]);

  const joinedPastEvents = useMemo(() => coerceArray(profileData?.eventsJoinedPast), [profileData]);

  const title = section === 'past'
    ? 'Past Events'
    : section === 'joined'
      ? 'Events Joined'
      : 'Live Events';

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchProfileEvents({ preferCache: false })}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <FadeInView style={styles.stack}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSub}>{profileName}</Text>
        </View>

        {section === 'live' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Created Live ({liveCreatedEvents.length})</Text>
            {liveCreatedEvents.length ? (
              liveCreatedEvents.map((event) => (
                <TouchableOpacity
                  key={`live-created-${event.id}`}
                  style={styles.eventRow}
                  onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                >
                  <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                  <Text style={styles.eventMeta}>👥 {event.participant_count || 0}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>No live events.</Text>
            )}
          </View>
        ) : null}

        {section === 'joined' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Live Joined ({joinedLiveEvents.length})</Text>
              {joinedLiveEvents.length ? (
                joinedLiveEvents.map((event) => (
                  <TouchableOpacity
                    key={`joined-live-${event.id}`}
                    style={styles.eventRow}
                    onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                  >
                    <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                    <Text style={styles.eventMeta}>👥 {event.participant_count || 0}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyText}>No live joined events.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Completed Joined ({joinedPastEvents.length})</Text>
              {joinedPastEvents.length ? (
                joinedPastEvents.map((event) => (
                  <View key={`joined-past-${event.id}`} style={[styles.eventRow, styles.eventRowMuted]}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                    <Text style={styles.eventMeta}>👥 {event.participant_count || 0} • {formatDaysAgoText(event)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No completed joined events.</Text>
              )}
            </View>
          </>
        ) : null}

        {section === 'past' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Created Past ({pastCreatedEvents.length})</Text>
            {pastCreatedEvents.length ? (
              pastCreatedEvents.map((event) => (
                <View key={`created-past-${event.id}`} style={[styles.eventRow, styles.eventRowMuted]}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                  <Text style={styles.eventMeta}>👥 {event.participant_count || 0} • {formatDaysAgoText(event)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No past events yet.</Text>
            )}
          </View>
        ) : null}
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 30 },
  stack: { gap: 12 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  header: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow.card,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  headerSub: {
    color: colors.textMuted,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadow.card,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  eventRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 4,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  eventRowMuted: {
    opacity: 0.86,
  },
  eventTitle: {
    color: colors.text,
    fontWeight: '700',
    flex: 1,
  },
  eventMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  retryBtnText: {
    color: colors.accentDeep,
    fontWeight: '800',
  },
});
