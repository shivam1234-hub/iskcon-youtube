import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelResult } from '../data/types';
import { useLibrary } from '../contexts/LibraryContext';
import { C } from '../theme/colors';

export default function SubscribeButton({
  channel,
  compact,
}: {
  channel: ChannelResult;
  compact?: boolean;
}) {
  const { isSubscribed, toggleSubscription } = useLibrary();
  const on = isSubscribed(channel.channelId);
  if (!channel.channelId) return null;
  return (
    <Pressable
      onPress={() => toggleSubscription(channel)}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.compact,
        on ? styles.on : styles.off,
        pressed && { opacity: 0.75 },
      ]}
    >
      {on && <Ionicons name="notifications-outline" size={14} color={C.text} />}
      <Text style={[styles.text, on ? styles.textOn : styles.textOff]}>
        {on ? 'Subscribed' : 'Subscribe'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 15, minHeight: 36, borderRadius: 18,
  },
  compact: { paddingHorizontal: 12, minHeight: 32 },
  off: { backgroundColor: C.text },
  on: { backgroundColor: C.surfaceHi },
  text: { fontSize: 13.5, fontWeight: '700' },
  textOff: { color: C.bg },
  textOn: { color: C.text },
});
