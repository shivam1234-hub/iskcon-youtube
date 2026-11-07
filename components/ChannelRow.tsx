import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChannelResult } from '../data/types';
import { openChannel } from '../utils/nav';
import { C } from '../theme/colors';
import Avatar from './Avatar';
import SubscribeButton from './SubscribeButton';
import { isHiddenChannel } from '../utils/iskcon';
import { useHiddenVersion } from '../hooks/useHidden';

export default function ChannelRow({ channel }: { channel: ChannelResult }) {
  useHiddenVersion();
  if (isHiddenChannel(channel.channelId, channel.title)) return null;
  return (
    <Pressable
      onPress={() => openChannel(channel)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <Avatar uri={channel.avatar} name={channel.title} size={64} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{channel.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[channel.handle, channel.subscribersText].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <SubscribeButton channel={channel} compact />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 6,
  },
  title: { color: C.text, fontSize: 15.5, fontWeight: '700' },
  meta: { color: C.textDim, fontSize: 12, marginTop: 3 },
});
