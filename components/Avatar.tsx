import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme/colors';

/** Channel picture, or the channel's initial when YouTube gave no image. */
export default function Avatar({ uri, name, size = 36 }: { uri?: string; name?: string; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[box, styles.bg]} />;
  return (
    <View style={[box, styles.bg, styles.center]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {(name ?? '?').trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: C.surfaceHi },
  center: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: C.textDim, fontWeight: '700' },
});
