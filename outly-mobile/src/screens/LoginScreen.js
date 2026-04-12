import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import DateTimePicker from '@react-native-community/datetimepicker';

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export default function LoginScreen() {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdayDate, setBirthdayDate] = useState(null);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const onBirthdayChange = (_, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowBirthdayPicker(false);
    }

    if (selectedDate) {
      setBirthdayDate(selectedDate);
    }
  };

  const handleLogin = async () => {
    if (!signInLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });
      await setSignInActive({ session: result.createdSessionId });
    } catch (err) {
      Alert.alert('Login Failed', err.errors?.[0]?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signUpLoaded) return;

    if (!firstName.trim() || !lastName.trim() || !birthdayDate) {
      Alert.alert('Missing Details', 'Please enter first name, last name, and birthday.');
      return;
    }

    setLoading(true);
    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        unsafeMetadata: {
          birthday: formatDate(birthdayDate),
        },
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setMode('verify');
    } catch (err) {
      Alert.alert('Sign Up Failed', err.errors?.[0]?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

const handleVerify = async () => {
  if (!signUpLoaded) return;
  setLoading(true);
  try {
    const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
    
    console.log('Verify result:', JSON.stringify(result, null, 2));
    console.log('Status:', result.status);

    if (result.status === 'complete') {
      await setSignUpActive({ session: result.createdSessionId });
      Alert.alert(
        'Account Created',
        'You can verify your identity now or later from the Verify ID tab.'
      );
    } else if (result.status === 'missing_requirements') {
      // Sometimes Clerk needs additional steps
      await setSignUpActive({ session: result.createdSessionId });
      Alert.alert(
        'Account Created',
        'Additional profile steps may be needed. You can still submit identity verification from the Verify ID tab.'
      );
    } else {
      Alert.alert('Status', `Unexpected status: ${result.status}`);
    }
  } catch (err) {
    console.log('Verify error:', JSON.stringify(err, null, 2));
    Alert.alert('Verification Failed', err.errors?.[0]?.message || 'Invalid code');
  } finally {
    setLoading(false);
  }
};

  const birthdayDisplay = birthdayDate ? formatDate(birthdayDate) : 'Select Birthday';

  const handleResendCode = async () => {
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      Alert.alert('Code Sent', 'A new verification code has been sent');
    } catch (err) {
      Alert.alert('Error', 'Could not resend code');
    }
  };

  if (mode === 'verify') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inner}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>We sent a verification code to {email}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Enter 6-digit code"
            placeholderTextColor="#aaa"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity style={styles.btn} onPress={handleVerify} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Verify Email</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={handleResendCode}>
            <Text style={styles.switchText}>Resend Code</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('signup')}>
            <Text style={styles.switchText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.appName}>Outly</Text>
        <Text style={styles.tagline}>Meet people near you</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'signup' && styles.tabActive]}
            onPress={() => setMode('signup')}
          >
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        {mode === 'signup' && (
          <>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First Name"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last Name"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <TouchableOpacity style={styles.input} onPress={() => setShowBirthdayPicker(true)}>
              <Text style={birthdayDate ? styles.inputText : styles.inputPlaceholder}>{birthdayDisplay}</Text>
            </TouchableOpacity>

            {showBirthdayPicker && (
              <DateTimePicker
                value={birthdayDate || new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onBirthdayChange}
                maximumDate={new Date()}
              />
            )}
          </>
        )}

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#aaa"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#aaa"
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.btn}
          onPress={mode === 'login' ? handleLogin : handleSignUp}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>
                {mode === 'login' ? 'Login' : 'Create Account'}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  appName: {
    fontSize: 48,
    fontWeight: '900',
    color: '#6C63FF',
    textAlign: 'center',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#6C63FF' },
  tabText: { color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    justifyContent: 'center',
  },
  inputText: {
    color: '#fff',
    fontSize: 15,
  },
  inputPlaceholder: {
    color: '#aaa',
    fontSize: 15,
  },
  btn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchText: { color: '#6C63FF', textAlign: 'center', marginTop: 8 },
  subtitle: { color: '#888', textAlign: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
});