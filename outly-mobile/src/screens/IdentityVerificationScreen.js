import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useUser } from '@clerk/clerk-expo';
import { useApi } from '../services/api';

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export default function IdentityVerificationScreen() {
  const api = useApi();
  const { user } = useUser();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdayDate, setBirthdayDate] = useState(null);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [documentType, setDocumentType] = useState('Aadhaar');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentImage, setDocumentImage] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [latestRequest, setLatestRequest] = useState(null);

  useEffect(() => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');

    const metadataBirthday = typeof user?.unsafeMetadata?.birthday === 'string'
      ? user.unsafeMetadata.birthday
      : '';
    if (metadataBirthday) {
      const parsedBirthday = new Date(metadataBirthday);
      if (!Number.isNaN(parsedBirthday.getTime())) {
        setBirthdayDate(parsedBirthday);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchLatestVerification();
  }, []);

  const statusLabel = useMemo(() => {
    const status = latestRequest?.status;
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    if (status === 'pending') return 'Pending Review';
    return 'Not Submitted';
  }, [latestRequest]);

  const birthdayValue = birthdayDate ? formatDate(birthdayDate) : '';

  const toBase64DataUrl = (asset) => {
    if (!asset?.base64) return '';
    const mimeType = asset.mimeType || 'image/jpeg';
    return `data:${mimeType};base64,${asset.base64}`;
  };

  const fetchLatestVerification = async () => {
    setLoadingStatus(true);
    try {
      const response = await api.get('/identity-verification/my/latest');
      setLatestRequest(response?.data?.data || null);
    } catch (error) {
      if (error?.response?.status !== 404) {
        console.log('Verification status fetch failed:', error?.response?.data || error?.message);
      }
      setLatestRequest(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  const onBirthdayChange = (_, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowBirthdayPicker(false);
    }

    if (selectedDate) {
      setBirthdayDate(selectedDate);
    }
  };

  const captureDocument = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow camera permission to capture your ID document.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
      cameraType: ImagePicker.CameraType.back,
    });

    if (!result.canceled && result.assets?.[0]) {
      setDocumentImage(result.assets[0]);
    }
  };

  const captureSelfie = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow camera permission for selfie verification.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });

    if (!result.canceled && result.assets?.[0]) {
      setSelfieImage(result.assets[0]);
    }
  };

  const submitVerification = async () => {
    if (!firstName.trim() || !lastName.trim() || !birthdayDate || !documentType.trim() || !documentNumber.trim()) {
      Alert.alert('Missing Details', 'Please fill all fields before submitting.');
      return;
    }

    if (documentNumber.trim().length < 4) {
      Alert.alert('Invalid Document Number', 'Please enter a valid document number.');
      return;
    }

    if (!documentImage?.base64) {
      Alert.alert('Document Required', 'Please capture a clear document image using your camera.');
      return;
    }

    if (!selfieImage?.base64) {
      Alert.alert('Selfie Required', 'Please capture a selfie for face verification.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/identity-verification/request', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthday: birthdayValue,
        documentType: documentType.trim(),
        documentNumber: documentNumber.trim(),
        documentImageBase64: toBase64DataUrl(documentImage),
        selfieImageBase64: toBase64DataUrl(selfieImage),
      });

      setLatestRequest(response?.data?.data || null);
      Alert.alert('Submitted', 'Your verification request was sent to admin for review.');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        'Could not submit verification right now. Please try again.';
      Alert.alert('Submission Failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>Capture your chosen ID document and selfie inside the app. Admin will review and approve.</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current status</Text>
          {loadingStatus ? (
            <ActivityIndicator color="#6C63FF" />
          ) : (
            <>
              <Text style={styles.statusValue}>{statusLabel}</Text>
              {latestRequest?.updatedAt ? (
                <Text style={styles.statusMeta}>Updated: {new Date(latestRequest.updatedAt).toLocaleString()}</Text>
              ) : null}
            </>
          )}
        </View>

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
          <Text style={birthdayDate ? styles.inputText : styles.inputPlaceholder}>
            {birthdayDate ? formatDate(birthdayDate) : 'Select Birthday'}
          </Text>
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

        <TextInput
          style={styles.input}
          value={documentType}
          onChangeText={setDocumentType}
          placeholder="Document Type (Aadhaar, Passport, PAN, etc.)"
          placeholderTextColor="#aaa"
        />

        <TextInput
          style={styles.input}
          value={documentNumber}
          onChangeText={setDocumentNumber}
          placeholder="Document Number"
          placeholderTextColor="#aaa"
          autoCapitalize="characters"
        />

        <TouchableOpacity style={styles.secondaryBtn} onPress={captureDocument} disabled={submitting}>
          <Text style={styles.secondaryBtnText}>
            {documentImage ? 'Document Captured. Tap to Recapture' : 'Capture Document (Camera Only)'}
          </Text>
        </TouchableOpacity>
        {documentImage?.uri ? <Image source={{ uri: documentImage.uri }} style={styles.preview} /> : null}

        <TouchableOpacity style={styles.secondaryBtn} onPress={captureSelfie} disabled={submitting}>
          <Text style={styles.secondaryBtnText}>
            {selfieImage ? 'Selfie Captured. Tap to Retake' : 'Capture Selfie (Camera Only)'}
          </Text>
        </TouchableOpacity>
        {selfieImage?.uri ? <Image source={{ uri: selfieImage.uri }} style={styles.preview} /> : null}

        <TouchableOpacity style={styles.primaryBtn} onPress={submitVerification} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Submit For Admin Review</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>You can come back later to this screen anytime from the Verify ID tab.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  inner: {
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 12,
  },
  subtitle: {
    color: '#9a9a9a',
    marginBottom: 6,
  },
  statusCard: {
    backgroundColor: '#191919',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
  },
  statusLabel: {
    color: '#9a9a9a',
    fontSize: 13,
  },
  statusValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  statusMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
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
  secondaryBtn: {
    backgroundColor: '#1e1e1e',
    borderColor: '#6C63FF',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#c7c2ff',
    fontWeight: '600',
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    resizeMode: 'cover',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  primaryBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
});
