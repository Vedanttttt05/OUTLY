import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@clerk/clerk-expo';
import { useApi } from '../services/api';
import FadeInView from '../components/FadeInView';
import { colors, radii, shadow } from '../theme/ui';

const INTEREST_OPTIONS = ['Music', 'Sports', 'Travel', 'Food', 'Art', 'Tech', 'Fitness', 'Movies'];
const HOBBY_OPTIONS = ['Gaming', 'Photography', 'Cycling', 'Reading', 'Dancing', 'Hiking', 'Cooking', 'Singing'];
const ONBOARDING_SKIP_KEY_PREFIX = 'outly_onboarding_skipped_';

const getOnboardingSkipKey = (userId) => `${ONBOARDING_SKIP_KEY_PREFIX}${userId || 'unknown'}`;

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Chip = ({ label, active, onPress }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

export default function OnboardingScreen({ navigation }) {
  const api = useApi();
  const { user } = useUser();
  const [hobbies, setHobbies] = useState([]);
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(false);

  const signupBirthday = typeof user?.unsafeMetadata?.birthday === 'string'
    ? user.unsafeMetadata.birthday
    : '';

  const normalizedSignupBirthday = (() => {
    if (!signupBirthday) return null;
    const parsedBirthday = new Date(signupBirthday);
    if (Number.isNaN(parsedBirthday.getTime())) return null;
    return formatDate(parsedBirthday);
  })();

  const toggle = (value, setState) => {
    setState((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  };

  const persistOnboardingSkip = async () => {
    await AsyncStorage.setItem(getOnboardingSkipKey(user?.id), '1');
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await api.put('/users/me/profile', {
        ...(normalizedSignupBirthday ? { birthday: normalizedSignupBirthday } : {}),
        hobbies,
        interests,
      });

      await persistOnboardingSkip();

      navigation.replace('Tabs');
    } catch (error) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not save onboarding details.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipForNow = async () => {
    setLoading(true);
    try {
      if (normalizedSignupBirthday) {
        await api.put('/users/me/profile', {
          birthday: normalizedSignupBirthday,
        });
      }

      await persistOnboardingSkip();

      navigation.replace('Tabs');
    } catch (error) {
      Alert.alert('Error', error?.response?.data?.message || 'Could not skip onboarding right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <FadeInView style={styles.panel}>
        <Text style={styles.title}>Build Your Vibe</Text>
        <Text style={styles.subtitle}>Pick what you like so Outly can surface people and events that feel right. You can skip and update this later.</Text>

        <Text style={styles.label}>Interests</Text>
        <View style={styles.wrap}>
          {INTEREST_OPTIONS.map((item) => (
            <Chip key={item} label={item} active={interests.includes(item)} onPress={() => toggle(item, setInterests)} />
          ))}
        </View>

        <Text style={styles.label}>Hobbies</Text>
        <View style={styles.wrap}>
          {HOBBY_OPTIONS.map((item) => (
            <Chip key={item} label={item} active={hobbies.includes(item)} onPress={() => toggle(item, setHobbies)} />
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleContinue} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkipForNow} disabled={loading}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
    ...shadow.card,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 8 },
  subtitle: { color: colors.textMuted, marginBottom: 6, lineHeight: 20 },
  label: { color: colors.text, marginTop: 10, fontWeight: '700', fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.accentDeep, fontWeight: '800' },
  btn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    ...shadow.lift,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  skipBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 13,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  skipBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
});
