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
import FadeInView from '../components/FadeInView';
import { colors, radii, shadow } from '../theme/ui';

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
  const [documentType, setDocumentType] = useState('Government ID');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentImage, setDocumentImage] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      const requestData = response?.data?.data || null;
      setLatestRequest(requestData);

      if (requestData) {
        setFirstName(requestData.firstName || user?.firstName || '');
        setLastName(requestData.lastName || user?.lastName || '');

        if (requestData.birthday) {
          const parsedBirthday = new Date(requestData.birthday);
          if (!Number.isNaN(parsedBirthday.getTime())) {
            setBirthdayDate(parsedBirthday);
          }
        }

        setDocumentType(requestData.documentType || 'Government ID');
        setDocumentNumber(requestData.documentNumber || requestData.aadhaarNumber || '');

        const existingDocumentBase64 = requestData.documentImageBase64 || requestData.aadhaarImageBase64;
        if (existingDocumentBase64) {
          setDocumentImage((prev) => prev || { uri: existingDocumentBase64 });
        }

        if (requestData.selfieImageBase64) {
          setSelfieImage((prev) => prev || { uri: requestData.selfieImageBase64 });
        }
      }
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

  const captureDocument = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow camera permission to capture your ID document.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
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
      mediaTypes: ['images'],
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
    if (submitting || deleting) return;

    if (!firstName.trim() || !lastName.trim() || !birthdayDate || !documentType.trim() || !documentNumber.trim()) {
      Alert.alert('Missing Details', 'Please fill all fields before submitting.');
      return;
    }

    if (documentNumber.trim().length < 4) {
      Alert.alert('Invalid Document Number', 'Please enter a valid document number.');
      return;
    }

    const normalizedDocumentImage =
      toBase64DataUrl(documentImage) ||
      latestRequest?.documentImageBase64 ||
      latestRequest?.aadhaarImageBase64 ||
      '';

    const normalizedSelfieImage =
      toBase64DataUrl(selfieImage) ||
      latestRequest?.selfieImageBase64 ||
      '';

    if (!normalizedDocumentImage) {
      Alert.alert('Document Required', 'Please capture a clear document image using your camera.');
      return;
    }

    if (!normalizedSelfieImage) {
      Alert.alert('Selfie Required', 'Please capture a selfie for face verification.');
      return;
    }

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthday: birthdayValue,
      documentType: documentType.trim(),
      documentNumber: documentNumber.trim(),
      documentImageBase64: normalizedDocumentImage,
      selfieImageBase64: normalizedSelfieImage,
    };

    setSubmitting(true);
    try {
      const response = latestRequest
        ? await api.put('/identity-verification/my/request', payload)
        : await api.post('/identity-verification/request', payload);

      setLatestRequest(response?.data?.data || null);
      Alert.alert(
        latestRequest ? 'Updated' : 'Submitted',
        latestRequest
          ? 'Your verification request was updated and sent for admin re-review.'
          : 'Your verification request was sent to admin for review.'
      );
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        'Could not submit verification right now. Please try again.';
      Alert.alert('Submission Failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteVerificationRequest = async () => {
    if (submitting || deleting) return;

    if (!latestRequest) {
      Alert.alert('No Request', 'There is no verification request to delete.');
      return;
    }

    Alert.alert('Delete Request', 'Are you sure you want to delete your verification request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.delete('/identity-verification/my/request');
            setLatestRequest(null);
            setDocumentImage(null);
            setSelfieImage(null);
            setDocumentNumber('');
            Alert.alert('Deleted', 'Your verification request was deleted. You can submit again anytime.');
          } catch (error) {
            const message =
              error?.response?.data?.message ||
              'Could not delete verification request right now.';
            Alert.alert('Delete Failed', message);
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <FadeInView style={styles.stack}>
        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>One active request per user. Capture your chosen ID document and selfie inside the app.</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current status</Text>
          {loadingStatus ? (
            <ActivityIndicator color={colors.accent} />
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
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last Name"
          placeholderTextColor={colors.textMuted}
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
            onValueChange={onBirthdayChange}
            onDismiss={onBirthdayDismiss}
            maximumDate={new Date()}
          />
        )}

        <TextInput
          style={styles.input}
          value={documentType}
          onChangeText={setDocumentType}
          placeholder="Document Type (Passport, Driver License, PAN, etc.)"
          placeholderTextColor={colors.textMuted}
        />

        <TextInput
          style={styles.input}
          value={documentNumber}
          onChangeText={setDocumentNumber}
          placeholder="Document Number"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
        />

        <TouchableOpacity style={styles.secondaryBtn} onPress={captureDocument} disabled={submitting || deleting}>
          <Text style={styles.secondaryBtnText}>
            {documentImage ? 'Document Captured. Tap to Recapture' : 'Capture Document (Camera Only)'}
          </Text>
        </TouchableOpacity>
        {documentImage?.uri ? <Image source={{ uri: documentImage.uri }} style={styles.preview} /> : null}

        <TouchableOpacity style={styles.secondaryBtn} onPress={captureSelfie} disabled={submitting || deleting}>
          <Text style={styles.secondaryBtnText}>
            {selfieImage ? 'Selfie Captured. Tap to Retake' : 'Capture Selfie (Camera Only)'}
          </Text>
        </TouchableOpacity>
        {selfieImage?.uri ? <Image source={{ uri: selfieImage.uri }} style={styles.preview} /> : null}

        <TouchableOpacity style={styles.primaryBtn} onPress={submitVerification} disabled={submitting || deleting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {latestRequest ? 'Update Request' : 'Submit For Admin Review'}
            </Text>
          )}
        </TouchableOpacity>

        {latestRequest ? (
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={deleteVerificationRequest}
            disabled={submitting || deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.dangerBtnText}>Delete Request</Text>
            )}
          </TouchableOpacity>
        ) : null}

        <Text style={styles.hint}>If request already exists, use Update or Delete instead of creating a new one.</Text>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: {
    padding: 20,
    paddingBottom: 28,
  },
  stack: { gap: 12 },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 12,
  },
  subtitle: {
    color: colors.textMuted,
    marginBottom: 6,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 4,
    ...shadow.card,
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  statusValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  statusMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  inputText: {
    color: colors.text,
    fontSize: 15,
  },
  inputPlaceholder: {
    color: colors.textMuted,
    fontSize: 15,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.accentDeep,
    fontWeight: '700',
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: radii.md,
    resizeMode: 'cover',
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    ...shadow.lift,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  dangerBtn: {
    backgroundColor: '#FFF3F3',
    borderColor: '#F2CBCB',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: '#A62F2F',
    fontSize: 15,
    fontWeight: '800',
  },
  hint: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
