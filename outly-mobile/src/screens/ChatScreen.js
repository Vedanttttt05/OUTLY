import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useUser } from '@clerk/clerk-expo';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import { colors, radii, shadow } from '../theme/ui';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'https://outly.onrender.com';
const CHAT_CACHE_TTL_MS = 30 * 60 * 1000;
const CHAT_CACHE_VERSION = 'v2';

const looksLikeUserId = (value) => typeof value === 'string' && /^user_[A-Za-z0-9]+$/.test(value.trim());

const formatTimeLabel = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getChatCacheKey = (eventId) => `chat_cache_${CHAT_CACHE_VERSION}_${eventId}`;

const saveChatCache = async (eventId, messages) => {
  if (!eventId) return;

  try {
    const trimmedMessages = Array.isArray(messages) ? messages.slice(-200) : [];
    await AsyncStorage.setItem(
      getChatCacheKey(eventId),
      JSON.stringify({
        updatedAt: Date.now(),
        messages: trimmedMessages,
      })
    );
  } catch (error) {
    // Best-effort cache.
  }
};

const MessageBubble = React.memo(function MessageBubble({ item, isMe, onOpenProfile }) {
  const rawSenderName = typeof item.sender_name === 'string' ? item.sender_name.trim() : '';
  const senderName = rawSenderName && !looksLikeUserId(rawSenderName) ? rawSenderName : 'User';
  const senderImage = item.sender_profile_image || null;
  const senderVerified = Boolean(item.sender_verified);

  return (
    <View
      style={[
        styles.messageBubble,
        isMe ? styles.myBubble : styles.theirBubble
      ]}
    >
      {!isMe && (
        <TouchableOpacity
          style={styles.senderRow}
          onPress={() => onOpenProfile(item.user_id)}
        >
          <Avatar uri={senderImage} name={senderName} size={24} />
          <Text style={styles.senderName}>{senderName}</Text>
          <VerifiedBadge visible={senderVerified} />
        </TouchableOpacity>
      )}

      <Text
        style={[
          styles.messageText,
          isMe && styles.myMessageText
        ]}
      >
        {item.content}
      </Text>

      <Text
        style={[
          styles.timeText,
          isMe && styles.myTimeText
        ]}
      >
        {formatTimeLabel(item.created_at)}
      </Text>
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.item === nextProps.item
  && prevProps.isMe === nextProps.isMe
));

export default function ChatScreen({ route, navigation }) {
  const { eventId, eventTitle } = route.params;
  const { userId } = useAuth();
  const { user } = useUser();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const socketRef = useRef(null);
  const flatListRef = useRef(null);
  const currentUserId = useMemo(() => String(userId || ''), [userId]);

  useEffect(() => {
    if (!userId) return;

    let mounted = true;

    const setupChat = async () => {
      let shouldFetchHistory = true;

      try {
        const cachedRaw = await AsyncStorage.getItem(getChatCacheKey(eventId));
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const cachedMessages = Array.isArray(cached?.messages) ? cached.messages : [];
          const updatedAt = Number(cached?.updatedAt || 0);
          const isFresh = updatedAt > 0 && Date.now() - updatedAt < CHAT_CACHE_TTL_MS;

          if (mounted && cachedMessages.length) {
            setMessages(cachedMessages);
            setLoading(false);
          }

          shouldFetchHistory = !isFresh;
        }
      } catch (error) {
        shouldFetchHistory = true;
      }

      if (!mounted) return;

      const socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setLoading(false);

        socket.emit('join_event', {
          eventId,
          userId: userId,
          includeHistory: shouldFetchHistory,
        });
      });

      socket.on('disconnect', () => setConnected(false));

      socket.on('message_history', async (history) => {
        const nextMessages = Array.isArray(history) ? history : [];
        setMessages(nextMessages);
        setLoading(false);
        await saveChatCache(eventId, nextMessages);
      });

      socket.on('new_message', async (message) => {
        setMessages((prev) => {
          const next = [...prev, message];
          void saveChatCache(eventId, next);
          return next;
        });

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      });

      socket.on('connect_error', (err) => {
        console.error('Socket error:', err);
        setLoading(false);
      });

      socket.on('chat_error', (payload) => {
        Alert.alert('Chat Access', payload?.message || 'Chat access is restricted for this event.');
        setLoading(false);
      });
    };

    setupChat();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };

  }, [eventId, userId]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || !socketRef.current || !userId) return;

    socketRef.current.emit('send_message', {
      eventId,
      userId: userId,
      message: input.trim(),
      senderName: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null,
      senderProfileImage: user?.imageUrl || null,
    });

    setInput('');
  }, [eventId, input, userId, user?.firstName, user?.imageUrl, user?.lastName]);

  const onOpenProfile = useCallback((profileUserId) => {
    navigation.navigate('Profile', { userId: profileUserId });
  }, [navigation]);

  const renderMessage = useCallback(({ item }) => (
    <MessageBubble
      item={item}
      isMe={String(item.user_id) === currentUserId}
      onOpenProfile={onOpenProfile}
    />
  ), [currentUserId, onOpenProfile]);

  const keyExtractor = useCallback((item, index) => {
    if (item?.id !== undefined && item?.id !== null) {
      return String(item.id);
    }
    return `${item?.created_at || 'message'}-${index}`;
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {eventTitle}
        </Text>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              connected
                ? styles.online
                : styles.offline
            ]}
          />

          <Text style={styles.statusText}>
            {connected
              ? 'Live'
              : 'Connecting...'}
          </Text>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color={colors.accent}
          />
          <Text style={styles.loadingText}>
            Loading chat...
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          contentContainerStyle={
            styles.messagesList
          }
          initialNumToRender={16}
          maxToRenderPerBatch={12}
          windowSize={10}
          removeClippedSubviews={true}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({
              animated: false
            })
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                No messages yet. Say hi!
              </Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          onSubmitEditing={sendMessage}
        />

        <TouchableOpacity
          style={[
            styles.sendBtn,
            !input.trim() &&
              styles.sendBtnDisabled
          ]}
          onPress={sendMessage}
          disabled={!input.trim()}
        >
          <Text style={styles.sendText}>
            ↑
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted
  },

  header: {
    backgroundColor: colors.surface,
    padding: 16,
    paddingTop: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    flex: 1
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },

  online: { backgroundColor: colors.success },
  offline: { backgroundColor: colors.danger },

  statusText: {
    color: colors.textMuted,
    fontSize: 12
  },

  messagesList: {
    padding: 16,
    gap: 8,
    flexGrow: 1
  },

  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 8
  },

  myBubble: {
    backgroundColor: colors.accent,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4
  },

  theirBubble: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },

  senderName: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 0,
    fontWeight: '700'
  },

  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },

  messageText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20
  },

  myMessageText: {
    color: '#fff'
  },

  timeText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end'
  },

  myTimeText: {
    color: 'rgba(255,255,255,0.6)'
  },

  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80
  },

  emptyChatText: {
    fontSize: 15,
    color: colors.textMuted
  },

  inputRow: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: colors.surface,
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },

  input: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },

  sendBtn: {
    backgroundColor: colors.accent,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.lift,
  },

  sendBtnDisabled: {
    backgroundColor: '#ccc'
  },

  sendText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  }
});