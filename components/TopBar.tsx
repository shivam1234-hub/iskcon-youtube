import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C } from '../theme/colors';

/** App header for the tab screens: wordmark on the left, search on the right. */
export default function TopBar({ title }: { title?: string }) {
  return (
    <View style={styles.bar}>
      {title ? (
        <Text style={styles.title}>{title}</Text>
      ) : (
        <View style={styles.brand}>
          <Image source={require('../assets/logo.png')} style={styles.logo} />
          <Text style={styles.word}>YouTube</Text>
        </View>
      )}
      <Pressable onPress={() => router.push('/search')} hitSlop={10} style={styles.icon}>
        <Ionicons name="search" size={23} color={C.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, height: 52,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logo: { width: 28, height: 28, borderRadius: 7 },
  word: { color: C.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  title: { color: C.text, fontSize: 20, fontWeight: '800' },
  icon: { padding: 4 },
});
