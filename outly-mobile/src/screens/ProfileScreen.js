import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useApi } from '../services/api';
import { buildRenderCacheKey, readRenderCache, writeRenderCache } from '../services/renderCache';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import FadeInView from '../components/FadeInView';
import { colors, radii, shadow } from '../theme/ui';

const INTEREST_OPTIONS = ['Music', 'Sports', 'Travel', 'Food', 'Art', 'Tech', 'Fitness', 'Movies'];
const HOBBY_OPTIONS = ['Gaming', 'Photography', 'Cycling', 'Reading', 'Dancing', 'Hiking', 'Cooking', 'Singing'];
const PROFILE_CACHE_TTL_MS = 2 * 60 * 1000;
const BLOCKED_USERS_CACHE_TTL_MS = 60 * 1000;

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseBirthdayParts = (value) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const isoDateMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);

    if (isoDateMatch) {
      return {
        year: Number(isoDateMatch[1]),
        month: Number(isoDateMatch[2]),
        day: Number(isoDateMatch[3]),
      };
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
        day: parsed.getDate(),
      };
    }
  }

  return null;
};

const formatBirthdayDisplay = (value) => {
  const parts = parseBirthdayParts(value);
  if (!parts) return '-';

  const dd = `${parts.day}`.padStart(2, '0');
  const mm = `${parts.month}`.padStart(2, '0');
  const yy = `${parts.year}`.slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const birthdayPartsToDate = (parts) => new Date(parts.year, parts.month - 1, parts.day);

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

const toBase64DataUrl = (asset) => {
  if (!asset?.base64) return null;
  const mimeType = asset.mimeType || 'image/jpeg';
  return `data:${mimeType};base64,${asset.base64}`;
};

const looksLikeUserId = (value) => typeof value === 'string' && /^user_[A-Za-z0-9]+$/.test(value.trim());

const buildDisplayName = (firstName, lastName, fallback = 'User') => {
  const cleanFirst = typeof firstName === 'string' ? firstName.trim() : '';
  const cleanLast = typeof lastName === 'string' ? lastName.trim() : '';
  const joined = [cleanFirst, cleanLast].filter(Boolean).join(' ').trim();

  if (!joined || looksLikeUserId(joined)) {
    return fallback;
  }

  return joined;
};

const displayEmailOrNull = (value) => {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (!email || email.endsWith('@unknown.local')) return null;
  return email;
};

const Chip = ({ label, active, onPress }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

export default function ProfileScreen({ route, navigation }) {
  const api = useApi();
  const { userId } = useAuth();
  const { user } = useUser();

  const targetUserId = route?.params?.userId || null;
  const isMe = !targetUserId || targetUserId === userId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdayDate, setBirthdayDate] = useState(null);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [bio, setBio] = useState('');
  const [hobbies, setHobbies] = useState([]);
  const [interests, setInterests] = useState([]);
  const [profileImageDataUrl, setProfileImageDataUrl] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const profileCacheKey = useMemo(
    () => buildRenderCacheKey('profile', { targetUserId: targetUserId || 'me' }),
    [targetUserId]
  );
  const blockedUsersCacheKey = useMemo(
    () => buildRenderCacheKey('blocked_users', { userId: userId || 'me' }),
    [userId]
  );

  const displayName = useMemo(() => {
    if (!profile) return 'Profile';
    const ownFallback = buildDisplayName(user?.firstName, user?.lastName, 'User');
    return buildDisplayName(profile.firstName, profile.lastName, isMe ? ownFallback : 'User');
  }, [profile, user, isMe]);

  const displayEmail = useMemo(() => displayEmailOrNull(profile?.email), [profile]);
  const liveCreatedEvents = useMemo(() => {
    if (!profile) return [];
    if (Array.isArray(profile.eventsCreatedLive)) return profile.eventsCreatedLive;
    return Array.isArray(profile.eventsCreated) ? profile.eventsCreated : [];
  }, [profile]);
  const pastCreatedEvents = useMemo(() => {
    if (!profile) return [];
    return Array.isArray(profile.eventsCreatedPast) ? profile.eventsCreatedPast : [];
  }, [profile]);
  const joinedLiveEvents = useMemo(() => {
    if (!profile) return [];
    if (Array.isArray(profile.eventsJoinedLive)) return profile.eventsJoinedLive;
    return Array.isArray(profile.eventsJoined) ? profile.eventsJoined : [];
  }, [profile]);
  const joinedPastEvents = useMemo(() => {
    if (!profile) return [];
    return Array.isArray(profile.eventsJoinedPast) ? profile.eventsJoinedPast : [];
  }, [profile]);

  const liveCreatedPreview = useMemo(() => liveCreatedEvents.slice(0, 3), [liveCreatedEvents]);
  const pastCreatedPreview = useMemo(() => pastCreatedEvents.slice(0, 3), [pastCreatedEvents]);
  const joinedPreview = useMemo(() => {
    const liveRows = joinedLiveEvents.map((event) => ({ ...event, _kind: 'live' }));
    const pastRows = joinedPastEvents.map((event) => ({ ...event, _kind: 'past' }));
    return [...liveRows, ...pastRows].slice(0, 3);
  }, [joinedLiveEvents, joinedPastEvents]);

  const applyProfileData = useCallback((data) => {
    if (!data) return;

    const ownFirstName = user?.firstName || '';
    const ownLastName = user?.lastName || '';
    setFirstName(data.firstName || (isMe ? ownFirstName : ''));
    setLastName(data.lastName || (isMe ? ownLastName : ''));

    if (data.birthday) {
      const birthdayParts = parseBirthdayParts(data.birthday);
      if (birthdayParts) {
        setBirthdayDate(birthdayPartsToDate(birthdayParts));
      }
    }

    setBio(data.bio || '');
    setHobbies(Array.isArray(data.hobbies) ? data.hobbies : []);
    setInterests(Array.isArray(data.interests) ? data.interests : []);
  }, [isMe, user?.firstName, user?.lastName]);

  const fetchBlockedUsers = useCallback(async ({ preferCache = false } = {}) => {
    if (!isMe) return;

    setBlockedUsersLoading(true);

    if (preferCache) {
      const cached = await readRenderCache(blockedUsersCacheKey, BLOCKED_USERS_CACHE_TTL_MS);
      if (Array.isArray(cached)) {
        setBlockedUsers(cached);
      }
    }

    try {
      const response = await api.get('/users/me/blocked');
      const nextBlockedUsers = Array.isArray(response?.data?.data) ? response.data.data : [];
      setBlockedUsers(nextBlockedUsers);
      void writeRenderCache(blockedUsersCacheKey, nextBlockedUsers);
    } catch (error) {
      setBlockedUsers([]);
    } finally {
      setBlockedUsersLoading(false);
    }
  }, [api, blockedUsersCacheKey, isMe]);

  const fetchProfile = useCallback(async ({ showLoading = true, navigateOnError = true, preferCache = false } = {}) => {
    let hydratedFromCache = false;

    if (showLoading && preferCache) {
      const cached = await readRenderCache(profileCacheKey, PROFILE_CACHE_TTL_MS);
      if (cached && typeof cached === 'object') {
        setProfile(cached);
        applyProfileData(cached);
        setLoading(false);
        hydratedFromCache = true;
      }
    }

    if (showLoading && !hydratedFromCache) {
      setLoading(true);
    }

    try {
      const path = isMe ? '/users/me/profile' : `/users/${targetUserId}/profile`;
      const response = await api.get(path);
      const data = response?.data?.data;
      setProfile(data || null);
      if (data) {
        applyProfileData(data);
        void writeRenderCache(profileCacheKey, data);
      }
    } catch (error) {
      if (!hydratedFromCache) {
        Alert.alert('Error', error?.response?.data?.message || 'Could not load profile');
        if (navigateOnError) {
          navigation.goBack();
        }
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [api, applyProfileData, isMe, navigation, profileCacheKey, targetUserId]);

  useEffect(() => {
    void fetchProfile({ preferCache: true });
    void fetchBlockedUsers({ preferCache: true });
  }, [fetchBlockedUsers, fetchProfile]);

  const handleRefreshProfile = async () => {
    if (refreshingProfile || loading) return;

    setRefreshingProfile(true);
    try {
      await Promise.all([
        fetchProfile({ showLoading: false, navigateOnError: false, preferCache: false }),
        fetchBlockedUsers({ preferCache: false }),
      ]);
    } finally {
      setRefreshingProfile(false);
    }
  };

  const toggleChoice = (value, list, setList) => {
    setList((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const uploadProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow gallery access to upload profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.75,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setProfileImageDataUrl(toBase64DataUrl(asset));
      setProfile((prev) => ({ ...prev, profileImageUrl: asset.uri }));
    }
  };

  const saveProfile = async () => {
    if (!isMe || saving) return;

    if (!birthdayDate) {
      Alert.alert('Missing Birthday', 'Please select your birthday.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.put('/users/me/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthday: formatDate(birthdayDate),
        hobbies,
        interests,
        bio: bio.trim(),
        profileImage: profileImageDataUrl,
      });

      const updated = response?.data?.data;
      setProfile((prev) => ({ ...prev, ...updated }));
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (error) {
      Alert.alert('Save Failed', error?.response?.data?.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const onBirthdayChange = (_, selectedDate) => {
    if (selectedDate) {
      setBirthdayDate(selectedDate);
    }

    if (Platform.OS === 'android') {
      setShowBirthdayPicker(false);
    }
  };

  const onBirthdayDismiss = () => {
    if (Platform.OS === 'android') {
      setShowBirthdayPicker(false);
    }
  };

  const blockOrUnblock = async () => {
    if (isMe || !targetUserId) return;

    try {
      await api.post(`/users/${targetUserId}/block`);
      Alert.alert('Blocked', 'User has been blocked.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not block user.');
    }
  };

  const reportUser = async () => {
    if (isMe || !targetUserId) return;

    try {
      await api.post(`/users/${targetUserId}/report`, {
        reason: 'abuse',
        description: 'Reported from profile screen',
      });
      Alert.alert('Reported', 'User has been reported to admin.');
    } catch (error) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not report user.');
    }
  };

  const unblockBlockedUser = async (blockedUserId) => {
    if (!blockedUserId) return;

    try {
      await api.delete(`/users/${blockedUserId}/block`);
      setBlockedUsers((prev) => prev.filter((entry) => entry.id !== blockedUserId));
    } catch (error) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not unblock user.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Profile unavailable</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshingProfile}
          onRefresh={handleRefreshProfile}
          tintColor={colors.accent}
        />
      }
    >
      <FadeInView style={styles.stack}>
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <Avatar uri={profile.profileImageUrl} name={displayName} size={84} />
          <View style={styles.badgeOverlay}>
            <VerifiedBadge visible={Boolean(profile.isVerified)} size="large" />
          </View>
        </View>

        <Text style={styles.name}>{displayName}</Text>
        {displayEmail ? <Text style={styles.email}>{displayEmail}</Text> : null}



        {isMe ? (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={uploadProfileImage}>
              <Text style={styles.secondaryBtnText}>Upload Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('IdentityVerification')}
            >
              <Text style={styles.secondaryBtnText}>Verify ID</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.warnBtn} onPress={blockOrUnblock}>
              <Text style={styles.warnBtnText}>Block</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={reportUser}>
              <Text style={styles.secondaryBtnText}>Report</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isMe ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Blocked Users</Text>
          {blockedUsersLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : blockedUsers.length ? (
            blockedUsers.map((blockedUser) => {
              const blockedName = buildDisplayName(
                blockedUser.firstName,
                blockedUser.lastName,
                displayEmailOrNull(blockedUser.email)?.split('@')[0] || 'User'
              );

              return (
                <View key={`blocked-${blockedUser.id}`} style={styles.blockedRow}>
                  <View style={styles.blockedMeta}>
                    <Text style={styles.blockedName}>{blockedName}</Text>
                    {displayEmailOrNull(blockedUser.email) ? (
                      <Text style={styles.blockedEmail}>{displayEmailOrNull(blockedUser.email)}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.unblockBtn}
                    onPress={() => unblockBlockedUser(blockedUser.id)}
                  >
                    <Text style={styles.unblockBtnText}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptySubText}>No blocked users.</Text>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.fieldLabel}>Birthday</Text>
        {isMe ? (
          <>
            <TouchableOpacity style={styles.input} onPress={() => setShowBirthdayPicker(true)}>
              <Text style={birthdayDate ? styles.valueText : styles.placeholderText}>
                {birthdayDate ? formatBirthdayDisplay(birthdayDate) : 'Select birthday'}
              </Text>
            </TouchableOpacity>
            {showBirthdayPicker ? (
              <DateTimePicker
                value={birthdayDate || new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onValueChange={onBirthdayChange}
                onDismiss={onBirthdayDismiss}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.valueText}>{formatBirthdayDisplay(profile.birthday)}</Text>
        )}

        <Text style={styles.fieldLabel}>Age</Text>
        <Text style={styles.valueText}>{profile.age || '-'}</Text>

        <Text style={styles.fieldLabel}>Bio</Text>
        {isMe ? (
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            multiline
            placeholder="Tell people about yourself"
            placeholderTextColor={colors.textMuted}
          />
        ) : (
          <Text style={styles.valueText}>{profile.bio || 'No bio yet'}</Text>
        )}

        <Text style={styles.fieldLabel}>Interests</Text>
        <View style={styles.chipsWrap}>
          {(isMe ? INTEREST_OPTIONS : profile.interests || []).map((item) => (
            <Chip
              key={`interest-${item}`}
              label={item}
              active={interests.includes(item)}
              onPress={() => isMe && toggleChoice(item, interests, setInterests)}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Hobbies</Text>
        <View style={styles.chipsWrap}>
          {(isMe ? HOBBY_OPTIONS : profile.hobbies || []).map((item) => (
            <Chip
              key={`hobby-${item}`}
              label={item}
              active={hobbies.includes(item)}
              onPress={() => isMe && toggleChoice(item, hobbies, setHobbies)}
            />
          ))}
        </View>

        {isMe ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={saveProfile} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save Profile</Text>}
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.eventsSectionCard}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('ProfileEvents', {
          section: 'live',
          userId: targetUserId || null,
          profileName: displayName,
        })}
      >
        <View style={styles.eventsSectionHeader}>
          <Text style={styles.eventsSectionTitle}>Live Events</Text>
          <Text style={styles.seeAllText}>See all</Text>
        </View>
        <Text style={styles.eventsSectionMeta}>{liveCreatedEvents.length} created live</Text>

        {liveCreatedPreview.length ? (
          liveCreatedPreview.map((event) => (
            <View key={`live-preview-${event.id}`} style={styles.eventsPreviewRow}>
              <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.eventMeta}>👥 {event.participant_count || 0}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptySubText}>No live events.</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.eventsSectionCard}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('ProfileEvents', {
          section: 'joined',
          userId: targetUserId || null,
          profileName: displayName,
        })}
      >
        <View style={styles.eventsSectionHeader}>
          <Text style={styles.eventsSectionTitle}>Events Joined</Text>
          <Text style={styles.seeAllText}>See all</Text>
        </View>
        <Text style={styles.eventsSectionMeta}>
          {joinedLiveEvents.length} live joined • {joinedPastEvents.length} completed
        </Text>

        {joinedPreview.length ? (
          joinedPreview.map((event) => (
            <View key={`joined-preview-${event._kind}-${event.id}`} style={styles.eventsPreviewRow}>
              <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.eventMeta}>
                {event._kind === 'live' ? 'Live' : formatDaysAgoText(event)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptySubText}>No joined events.</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.eventsSectionCard}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('ProfileEvents', {
          section: 'past',
          userId: targetUserId || null,
          profileName: displayName,
        })}
      >
        <View style={styles.eventsSectionHeader}>
          <Text style={styles.eventsSectionTitle}>Past Events</Text>
          <Text style={styles.seeAllText}>See all</Text>
        </View>
        <Text style={styles.eventsSectionMeta}>{pastCreatedEvents.length} completed</Text>

        {pastCreatedPreview.length ? (
          pastCreatedPreview.map((event) => (
            <View key={`past-preview-${event.id}`} style={styles.eventsPreviewRow}>
              <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.eventMeta}>👥 {event.participant_count || 0} • {formatDaysAgoText(event)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptySubText}>No past events yet.</Text>
        )}
      </TouchableOpacity>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  stack: { gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  emptyText: { color: colors.text },
  header: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  avatarWrap: { position: 'relative' },
  badgeOverlay: { position: 'absolute', bottom: -2, right: -2 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 10 },
  email: { color: colors.textMuted, marginTop: 4 },
  refreshProfileBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  refreshProfileBtnDisabled: {
    opacity: 0.7,
  },
  refreshProfileBtnText: {
    color: colors.accentDeep,
    fontWeight: '800',
    fontSize: 13,
  },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    ...shadow.lift,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryBtnText: { color: colors.accentDeep, fontWeight: '800' },
  warnBtn: {
    marginTop: 12,
    backgroundColor: '#FFF5F5',
    borderColor: '#F3CACA',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  warnBtnText: { color: '#A62F2F', fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadow.card,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  fieldLabel: { color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', marginTop: 8, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    justifyContent: 'center',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  valueText: { color: colors.text },
  placeholderText: { color: colors.textMuted },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: colors.accentDeep, fontWeight: '800' },
  eventsSectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadow.card,
  },
  eventsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventsSectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  seeAllText: {
    color: colors.accentDeep,
    fontWeight: '800',
    fontSize: 13,
  },
  eventsSectionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  eventsPreviewRow: {
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
  eventRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 6,
    backgroundColor: colors.surfaceMuted,
  },
  eventRowMuted: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 6,
    backgroundColor: colors.surfaceMuted,
    opacity: 0.85,
  },
  eventTitle: { color: colors.text, fontWeight: '700' },
  eventMeta: { color: colors.textMuted, marginTop: 2 },
  emptySubText: { color: colors.textMuted },
  blockedRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.surfaceMuted,
  },
  blockedMeta: { flex: 1 },
  blockedName: { color: colors.text, fontWeight: '700' },
  blockedEmail: { color: colors.textMuted, marginTop: 2, fontSize: 12 },
  unblockBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  unblockBtnText: { color: colors.accentDeep, fontWeight: '800' },
});
