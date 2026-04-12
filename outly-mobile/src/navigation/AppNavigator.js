import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import MapScreen from '../screens/MapScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import MyEventsScreen from '../screens/MyEventsScreen';
import LoginScreen from '../screens/LoginScreen';
import IdentityVerificationScreen from '../screens/IdentityVerificationScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
    
      screenOptions={{
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#aaa',
        headerShown: false,
      }}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="My Events" component={MyEventsScreen} />
      <Tab.Screen name="Create" component={CreateEventScreen} />
      <Tab.Screen name="Verify ID" component={IdentityVerificationScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} />
            <Stack.Screen name="EventDetail" component={EventDetailScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}