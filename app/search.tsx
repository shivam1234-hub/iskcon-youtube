import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrary } from '../contexts/LibraryContext';
import { suggest } from '../utils/youtube';
import { cleanSuggestion, iskconSuggestPrefix, isIskconText } from '../utils/iskcon';
import { listen } from '../utils/voice';
import { C } from '../theme/colors';

/**
 * Search entry: live suggestions while typing, recent searches when empty.
 * Submitting replaces this screen with the results, so Back from results
 * returns to wherever search was opened from.
 */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { q: initial } = useLocalSearchParams<{ q?: string }>();
  const { recentSearches, addSearch, removeSearch } = useLibrary();
  const [text, setText] = useState(initial ? String(initial) : '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      // Ask for ISKCON completions only ("iskcon b..." rather than "b..."),
      // and drop any that still don't name something ISKCON.
      suggest(iskconSuggestPrefix(q), ctrl.signal)
        .then((list) =>
          setSuggestions(
            list
              .filter(isIskconText)
              .map(cleanSuggestion)
              .filter((v, i, a) => a.indexOf(v) === i),
          ),
        )
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    addSearch(query);
    router.replace({ pathname: '/results', params: { q: query } });
  };

  const voice = async () => {
    const said = await listen();
    if (said) {
      setText(said);
      submit(said);
    }
  };

  const showingRecent = !text.trim();
  const rows = showingRecent
    ? recentSearches
    : // Matching recent searches first, then live suggestions.
      [
        ...recentSearches.filter((r) => r.toLowerCase().startsWith(text.trim().toLowerCase())).slice(0, 3),
        ...suggestions,
      ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={23} color={C.text} />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder="Search YouTube"
            placeholderTextColor={C.textMute}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => submit(text)}
            autoCorrect={false}
            selectTextOnFocus
          />
          {text.length > 0 && (
            <Pressable onPress={() => setText('')} hitSlop={8}>
              <Ionicons name="close" size={20} color={C.textDim} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={voice} hitSlop={8} style={styles.mic}>
          <Ionicons name="mic" size={22} color={C.text} />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(s) => s}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const recent = recentSearches.includes(item);
          return (
            <Pressable
              onPress={() => submit(item)}
              onLongPress={() => recent && removeSearch(item)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surface }]}
            >
              <Ionicons name={recent ? 'time-outline' : 'search'} size={20} color={C.textDim} />
              <Text style={styles.rowText} numberOfLines={1}>{item}</Text>
              {/* Fill the box without searching, to refine the query. */}
              <Pressable
                onPress={() => {
                  setText(item + ' ');
                  inputRef.current?.focus();
                }}
                hitSlop={8}
              >
                <Ionicons name="arrow-up-outline" size={20} color={C.textDim} style={styles.fill} />
              </Pressable>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          showingRecent && recentSearches.length > 0 ? (
            <Text style={styles.head}>Recent searches · long-press to remove</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, height: 56 },
  iconBtn: { padding: 6 },
  mic: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceHi,
    alignItems: 'center', justifyContent: 'center',
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surfaceHi, borderRadius: 20, paddingHorizontal: 14, height: 40,
  },
  input: { flex: 1, color: C.text, fontSize: 15.5, paddingVertical: 0 },
  head: { color: C.textMute, fontSize: 12, marginHorizontal: 16, marginVertical: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 16, minHeight: 50,
  },
  rowText: { flex: 1, color: C.text, fontSize: 15 },
  fill: { transform: [{ rotate: '-45deg' }] },
});
