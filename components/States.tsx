import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme/colors';

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={C.accent} />
      {label ? <Text style={styles.text}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={C.textMute} />
      <Text style={styles.title}>Couldn't reach YouTube</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.btn}>
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: any; title: string; text?: string }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={C.textMute} />
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
    </View>
  );
}

/** Horizontal chip strip. A ScrollView, not a FlatList, so chips size to their labels. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      style={{ flexGrow: 0 }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 8 },
  title: { color: C.text, fontSize: 16, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  text: { color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  btn: {
    marginTop: 12, paddingHorizontal: 18, minHeight: 38, justifyContent: 'center',
    borderRadius: 19, borderWidth: 1, borderColor: C.border,
  },
  btnText: { color: C.text, fontSize: 13.5, fontWeight: '700' },
  chips: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    minHeight: 34, paddingHorizontal: 13, borderRadius: 9, justifyContent: 'center',
    backgroundColor: C.surfaceHi,
  },
  chipOn: { backgroundColor: C.text },
  chipText: { color: C.text, fontSize: 13.5, fontWeight: '600' },
  chipTextOn: { color: C.bg },
});
