import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { io } from 'socket.io-client';
import { useAuth } from '@clerk/clerk-expo';

const SOCKET_URL = 'https://outly.onrender.com';

export default function ChatScreen({ route }) {
  const { eventId, eventTitle } = route.params;
  const { userId } = useAuth();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const socketRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (!userId) return;

    const socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);

      socket.emit('join_event', {
        eventId,
        userId: userId,
      });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('message_history', (history) => {
      setMessages(Array.isArray(history) ? history : []);
      setLoading(false);
    });

    socket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket error:', err);
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };

  }, [eventId, userId]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || !userId) return;

    socketRef.current.emit('send_message', {
      eventId,
      userId: userId,
      message: input.trim(),
    });

    setInput('');
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMessage = ({ item }) => {
      console.log("FULL MESSAGE:", item);

    // FIX: convert both to string
    const isMe = String(item.user_id) === String(userId);

    // Debug (remove later)
    console.log("message user:", item.user_id);
    console.log("my user:", userId);

    return (
      <View
        style={[
          styles.messageBubble,
          isMe ? styles.myBubble : styles.theirBubble
        ]}
      >
        {!isMe && (
          <Text style={styles.senderName}>
            {item.user_id}
          </Text>
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
          {formatTime(item.created_at)}
        </Text>
      </View>
    );
  };

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
            color="#6C63FF"
          />
          <Text style={styles.loadingText}>
            Loading chat...
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) =>
            item.id || String(index)
          }
          renderItem={renderMessage}
          contentContainerStyle={
            styles.messagesList
          }
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({
              animated: false
            })
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                No messages yet. Say hi! 👋
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
          placeholderTextColor="#aaa"
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
    backgroundColor: '#f5f5f5'
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888'
  },

  header: {
    backgroundColor: '#6C63FF',
    padding: 16,
    paddingTop: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },

  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
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

  online: { backgroundColor: '#2ecc71' },
  offline: { backgroundColor: '#e74c3c' },

  statusText: {
    color: 'rgba(255,255,255,0.8)',
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
    borderRadius: 16,
    marginBottom: 8
  },

  myBubble: {
    backgroundColor: '#6C63FF',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4
  },

  theirBubble: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1
  },

  senderName: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
    fontWeight: '600'
  },

  messageText: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 20
  },

  myMessageText: {
    color: '#fff'
  },

  timeText: {
    fontSize: 10,
    color: '#aaa',
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
    color: '#aaa'
  },

  inputRow: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    alignItems: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0'
  },

  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#1a1a1a'
  },

  sendBtn: {
    backgroundColor: '#6C63FF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
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