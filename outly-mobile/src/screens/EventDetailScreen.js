import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView, Alert, Linking, Platform
} from 'react-native';
import { useApi } from '../services/api';
import { useAuth, useUser } from '@clerk/clerk-expo';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import FadeInView from '../components/FadeInView';
import { colors, radii, shadow } from '../theme/ui';

const looksLikeUserId = (value) => typeof value === 'string' && /^user_[A-Za-z0-9]+$/.test(value.trim());

const safeDisplayName = (firstName, lastName, email = null, fallback = 'User', extraFallbackName = null) => {
  const joined = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (joined && !looksLikeUserId(joined)) return joined;

  const extraName = typeof extraFallbackName === 'string' ? extraFallbackName.trim() : '';
  if (extraName && !looksLikeUserId(extraName)) return extraName;

  const emailPrefix = typeof email === 'string' && email.includes('@')
    ? email.split('@')[0].trim()
    : '';

  if (emailPrefix && !looksLikeUserId(emailPrefix)) return emailPrefix;

  if (!joined || looksLikeUserId(joined)) return fallback;
  return joined;
};

export default function EventDetailScreen({ route, navigation }) {
  const api = useApi();
  const { userId } = useAuth();
  const { user } = useUser();
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [reviewingParticipantId, setReviewingParticipantId] = useState(null);
  const [completingEvent, setCompletingEvent] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);

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
      const response = await api.post(`/events/${eventId}/join`);
      const status = response?.data?.data?.status;

      setEvent((prev) => ({
        ...prev,
        currentUserStatus: status === 'accepted' ? 'accepted' : 'pending',
      }));

      Alert.alert('Request Sent', 'You are now marked as interested. Creator approval is required.');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', err?.response?.data?.message || 'Could not mark interest for this event');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    setJoining(true);
    try {
      await api.post(`/events/${eventId}/leave`);
      setEvent((prev) => ({
        ...prev,
        currentUserStatus: null,
      }));
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not leave event');
    } finally {
      setJoining(false);
    }
  };

  const handleMarkCompleted = () => {
    if (completingEvent) return;

    Alert.alert(
      'Mark Event Completed',
      'This will close the event and stop new participation actions. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Completed',
          style: 'destructive',
          onPress: async () => {
            setCompletingEvent(true);
            try {
              await api.patch(`/events/${eventId}/complete`);
              setEvent((prev) => (prev ? { ...prev, is_expired: true } : prev));
              Alert.alert('Done', 'Event marked as completed.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error', err?.response?.data?.message || 'Could not mark event as completed');
            } finally {
              setCompletingEvent(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteEvent = () => {
    if (deletingEvent) return;

    Alert.alert(
      'Delete Event',
      'This will permanently remove the event for everyone. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingEvent(true);
            try {
              await api.delete(`/events/${eventId}`);
              Alert.alert('Deleted', 'Event deleted successfully.', [
                {
                  text: 'OK',
                  onPress: () => navigation.navigate('Tabs', { screen: 'My Events' }),
                },
              ]);
            } catch (err) {
              console.error(err);
              Alert.alert('Error', err?.response?.data?.message || 'Could not delete this event');
            } finally {
              setDeletingEvent(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Date TBD';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const isCreator = event?.createdBy === userId;
  const isExpired = Boolean(event?.is_expired);
  const isFull = Boolean(event?.is_full);
  const currentStatus = event?.currentUserStatus;
  const canChat = Boolean(isCreator || currentStatus === 'accepted') && !isExpired;
  const ownNameFallback = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  const creatorDisplayName = safeDisplayName(
    event?.creator?.firstName,
    event?.creator?.lastName,
    event?.creator?.email,
    'User',
    event?.creator?.userId === userId ? ownNameFallback : null
  );
  const eventLatitude = Number(event?.latitude);
  const eventLongitude = Number(event?.longitude);
  const hasCoordinates = Number.isFinite(eventLatitude) && Number.isFinite(eventLongitude);
  const canOpenDirections = Boolean(hasCoordinates && (isCreator || currentStatus === 'accepted'));
  const locationDisplay = hasCoordinates
    ? `${eventLatitude.toFixed(4)}, ${eventLongitude.toFixed(4)}`
    : 'Location unavailable';

  const handleOpenDirections = async () => {
    if (!hasCoordinates) {
      Alert.alert('Location unavailable', 'This event does not have valid map coordinates yet.');
      return;
    }

    if (!canOpenDirections) {
      Alert.alert('Directions locked', 'Directions are available once your request is accepted.');
      return;
    }

    const encodedLabel = encodeURIComponent(event?.title || 'Event location');
    const appleMapsUrl = `http://maps.apple.com/?daddr=${eventLatitude},${eventLongitude}&dirflg=d`;
    const googleNavUrl = `google.navigation:q=${eventLatitude},${eventLongitude}`;
    const geoUrl = `geo:${eventLatitude},${eventLongitude}?q=${eventLatitude},${eventLongitude}(${encodedLabel})`;
    const googleMapsFallback = `https://www.google.com/maps/dir/?api=1&destination=${eventLatitude},${eventLongitude}`;

    try {
      if (Platform.OS === 'ios') {
        const canOpenAppleMaps = await Linking.canOpenURL(appleMapsUrl);
        if (canOpenAppleMaps) {
          await Linking.openURL(appleMapsUrl);
          return;
        }
      } else {
        const canOpenGoogleNav = await Linking.canOpenURL(googleNavUrl);
        if (canOpenGoogleNav) {
          await Linking.openURL(googleNavUrl);
          return;
        }

        const canOpenGeo = await Linking.canOpenURL(geoUrl);
        if (canOpenGeo) {
          await Linking.openURL(geoUrl);
          return;
        }
      }

      await Linking.openURL(googleMapsFallback);
    } catch (error) {
      console.error(error);
      Alert.alert('Could not open maps', 'Please try again in a moment.');
    }
  };

  const reviewParticipant = async (participantId, status) => {
    setReviewingParticipantId(participantId);
    try {
      await api.patch(`/events/${eventId}/participants/${participantId}/review`, { status });
      await fetchEvent();
    } catch (error) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not update participant status');
    } finally {
      setReviewingParticipantId(null);
    }
  };

  const renderParticipant = (participant, showActions = false) => {
    const participantName = safeDisplayName(participant.firstName, participant.lastName, null, 'User');

    return (
      <TouchableOpacity
        key={`${participant.userId}-${participant.status || 'accepted'}`}
        style={styles.participantRow}
        onPress={() => navigation.navigate('Profile', { userId: participant.userId })}
      >
        <Avatar uri={participant.profileImageUrl} name={participantName} size={34} />

        <View style={styles.participantMeta}>
          <View style={styles.participantNameRow}>
            <Text style={styles.participantName}>{participantName}</Text>
            <VerifiedBadge visible={Boolean(participant.isVerified)} />
          </View>
          <Text style={styles.participantSub}>{participant.status || 'accepted'}</Text>
        </View>

        {showActions ? (
          <View style={styles.participantActions}>
            <TouchableOpacity
              style={styles.acceptBtn}
              disabled={reviewingParticipantId === participant.userId}
              onPress={() => reviewParticipant(participant.userId, 'accepted')}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              disabled={reviewingParticipantId === participant.userId}
              onPress={() => reviewParticipant(participant.userId, 'rejected')}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
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
        {isFull ? <Text style={styles.flagText}>Event Full</Text> : null}
        {isExpired ? <Text style={[styles.flagText, styles.expiredFlag]}>Event Expired</Text> : null}
      </View>

      <FadeInView>
      {event.creator ? (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Profile', { userId: event.creator.userId })}
        >
          <Text style={styles.label}>Creator</Text>
          <View style={styles.creatorRow}>
            <Avatar
              uri={event.creator.profileImageUrl}
              name={creatorDisplayName}
              size={44}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.participantNameRow}>
                <Text style={styles.creatorName}>
                  {creatorDisplayName}
                </Text>
                <VerifiedBadge visible={Boolean(event.creator.isVerified)} />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.icon}>📅</Text>
          <View>
            <Text style={styles.label}>Date & Time</Text>
            <Text style={styles.value}>{formatDate(event.eventDateTime || event.created_at)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={[styles.row, styles.locationRow, !canOpenDirections && styles.locationRowDisabled]}
          activeOpacity={0.85}
          onPress={handleOpenDirections}
          disabled={!canOpenDirections}
        >
          <Text style={styles.icon}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.value}>{locationDisplay}</Text>
            <Text style={[styles.locationHint, !canOpenDirections && styles.locationHintLocked]}>
              {!hasCoordinates
                ? 'No map pin available'
                : canOpenDirections
                  ? 'Tap to open driving directions'
                  : 'Directions unlock after acceptance'}
            </Text>
          </View>
          {canOpenDirections ? <Text style={styles.locationAction}>Open</Text> : null}
        </TouchableOpacity>
      </View>

      {event.description && (
        <View style={styles.card}>
          <Text style={styles.label}>About</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Accepted Participants</Text>
        {(event.acceptedParticipants || []).length ? (
          event.acceptedParticipants.map((participant) => renderParticipant(participant, false))
        ) : (
          <Text style={styles.description}>No accepted participants yet.</Text>
        )}
      </View>

      {isCreator ? (
        <View style={styles.card}>
          <Text style={styles.label}>Interested Users</Text>
          {(event.pendingParticipants || []).length ? (
            event.pendingParticipants.map((participant) => renderParticipant(participant, true))
          ) : (
            <Text style={styles.description}>No pending requests.</Text>
          )}
        </View>
      ) : null}

      <View style={styles.buttons}>
        {isCreator ? (
          <View style={styles.creatorActionsRow}>
            <TouchableOpacity
              style={[styles.completeBtn, (completingEvent || isExpired) && styles.secondaryBtnDisabled]}
              onPress={handleMarkCompleted}
              disabled={completingEvent || isExpired}
            >
              {completingEvent
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.completeBtnText}>{isExpired ? 'Completed' : 'Mark Completed'}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, deletingEvent && styles.secondaryBtnDisabled]}
              onPress={handleDeleteEvent}
              disabled={deletingEvent}
            >
              {deletingEvent
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.deleteBtnText}>Delete Event</Text>}
            </TouchableOpacity>
          </View>
        ) : null}

        {!isCreator ? (
          <TouchableOpacity
            style={[styles.joinBtn, currentStatus && styles.leaveBtn]}
            onPress={currentStatus ? handleLeave : handleJoin}
            disabled={joining || isExpired || (!currentStatus && isFull)}
          >
            {joining
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.joinText}>
                  {currentStatus === 'accepted'
                    ? 'Leave Event'
                    : currentStatus === 'pending'
                      ? 'Cancel Request'
                      : 'Interested'}
                </Text>
            }
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.chatBtn, !canChat && styles.chatBtnDisabled]}
          onPress={() => navigation.navigate('Chat', { eventId, eventTitle: event.title })}
          disabled={!canChat}
        >
          <Text style={styles.chatText}>💬 {canChat ? 'Open Chat' : 'Chat Locked'}</Text>
        </TouchableOpacity>
      </View>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: colors.danger },
  header: {
    backgroundColor: colors.surface,
    padding: 24,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  category: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
  },
  flagText: {
    marginTop: 6,
    color: colors.warning,
    fontWeight: '800',
  },
  expiredFlag: {
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  icon: { fontSize: 20 },
  label: { fontSize: 12, color: colors.textMuted, marginBottom: 2, fontWeight: '700' },
  value: { fontSize: 15, color: colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border },
  locationRow: {
    borderRadius: radii.md,
  },
  locationRowDisabled: {
    opacity: 0.7,
  },
  locationHint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.accentDeep,
    fontWeight: '700',
  },
  locationHintLocked: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  locationAction: {
    color: colors.accentDeep,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  description: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginTop: 8 },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  participantMeta: { flex: 1 },
  participantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  participantName: { fontWeight: '700', color: colors.text },
  participantSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  participantActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  rejectBtn: {
    backgroundColor: '#FDECEC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  rejectText: { color: '#9b2c2c', fontWeight: '700', fontSize: 12 },
  buttons: { padding: 16, gap: 12, marginTop: 8 },
  creatorActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  completeBtn: {
    flex: 1,
    backgroundColor: colors.warning,
    padding: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: colors.danger,
    padding: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtnDisabled: {
    opacity: 0.6,
  },
  joinBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    ...shadow.lift,
  },
  leaveBtn: { backgroundColor: colors.danger },
  joinText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chatBtn: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  chatBtnDisabled: {
    opacity: 0.5,
  },
  chatText: { color: colors.accentDeep, fontSize: 16, fontWeight: '800' },
});