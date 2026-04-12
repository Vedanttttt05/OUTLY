import React from 'react';
import { View, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import MapScreen from '../screens/MapScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import MyEventsScreen from '../screens/MyEventsScreen';
import LoginScreen from '../screens/LoginScreen';
import IdentityVerificationScreen from '../screens/IdentityVerificationScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProfileEventsScreen from '../screens/ProfileEventsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import Avatar from '../components/Avatar';
import { useApi } from '../services/api';
import { colors, shadow, radii } from '../theme/ui';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const ONBOARDING_SKIP_KEY_PREFIX = 'outly_onboarding_skipped_';

const getOnboardingSkipKey = (userId) => `${ONBOARDING_SKIP_KEY_PREFIX}${userId || 'unknown'}`;

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function HeaderProfileButton({ navigation }) {
  const { user } = useUser();
  const api = useApi();
  const [profileImageUrl, setProfileImageUrl] = React.useState(user?.imageUrl || null);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'User';
  const firstName = user?.firstName?.trim() || 'Profile';

  React.useEffect(() => {
    let mounted = true;
    api.get('/users/me/profile')
      .then((res) => {
        const url = res?.data?.data?.profileImageUrl;
        if (mounted && url) setProfileImageUrl(url);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      api.get('/users/me/profile')
        .then((res) => {
          const url = res?.data?.data?.profileImageUrl;
          if (url) setProfileImageUrl(url);
        })
        .catch(() => {});
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Profile')}
      style={{ marginRight: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', maxWidth: 92 }} numberOfLines={1}>
        {firstName}
      </Text>
      <Avatar uri={profileImageUrl} name={name} size={32} />
    </TouchableOpacity>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ navigation, route }) => ({
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          borderRadius: 24,
          height: 68,
          paddingBottom: 10,
          paddingTop: 10,
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          ...shadow.lift,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Map') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'My Events') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Create') {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
          }
          return <Ionicons name={iconName} size={24} color={color} />;
        },
        headerStyle: {
          backgroundColor: colors.surface,
          shadowColor: colors.border,
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 2,
        },
        headerTitleStyle: {
          color: colors.text,
          fontWeight: '800',
          fontSize: 20,
        },
        headerTintColor: colors.text,
        headerRight: () => <HeaderProfileButton navigation={navigation} />,
      })}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{ title: 'Explore' }}
      />
      <Tab.Screen
        name="My Events"
        component={MyEventsScreen}
        options={{ title: 'My Events' }}
      />
      <Tab.Screen
        name="Create"
        component={CreateEventScreen}
        options={{ title: 'Create' }}
      />
    </Tab.Navigator>
  );
}

function SignedInStack() {
  const api = useApi();
  const [checking, setChecking] = React.useState(true);
  const [needsOnboarding, setNeedsOnboarding] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await api.get('/users/me/profile');
        const profile = response?.data?.data;
        const missingHobbies = !Array.isArray(profile?.hobbies) || profile.hobbies.length === 0;
        const missingInterests = !Array.isArray(profile?.interests) || profile.interests.length === 0;

        const hasSkippedOnboarding = (await AsyncStorage.getItem(getOnboardingSkipKey(profile?.id))) === '1';
        const shouldShowOnboarding = !hasSkippedOnboarding && missingHobbies && missingInterests;

        if (mounted) setNeedsOnboarding(shouldShowOnboarding);
      } catch (error) {
        if (mounted) setNeedsOnboarding(false);
      } finally {
        if (mounted) setChecking(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      initialRouteName={needsOnboarding ? 'Onboarding' : 'Tabs'}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ProfileEvents" component={ProfileEventsScreen} />
      <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  return (
    <NavigationContainer theme={navTheme}>
      {isSignedIn ? (
        <SignedInStack />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}