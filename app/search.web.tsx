import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibrary } from '../contexts/LibraryContext';
import { EmptyState, IconBtn, Pill, Txt, web } from '../components/desktop/ui';
import { PageScroll } from '../components/desktop/Layout';
import { useT } from '../components/desktop/theme';

/**
 * Desktop: typing happens in the masthead box (live suggestions there). This
 * route is the full list of recent searches, to rerun or remove them.
 */
export default function SearchScreen() {
  const t = useT();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { recentSearches, addSearch, removeSearch, clearSearches } = useLibrary();

  useEffect(() => {
    if (q) router.replace({ pathname: '/results', params: { q: String(q) } });
  }, [q]);

  const run = (s: string) => {
    addSearch(s);
    router.push({ pathname: '/results', params: { q: s } });
  };

  return (
    <PageScroll contentStyle={{ paddingTop: 24 }} maxWidth={820}>
      {() => (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Txt size={36} weight="700" style={{ flex: 1 }}>Recent searches</Txt>
            {recentSearches.length ? <Pill small icon="trash-outline" label="Clear all" onPress={clearSearches} /> : null}
          </View>
          {recentSearches.length === 0 ? (
            <EmptyState icon="search-outline" title="No recent searches" text="Use the search box at the top. Press Ctrl+K to jump to it." />
          ) : (
            recentSearches.map((s) => (
              <Pressable
                key={s}
                onPress={() => run(s)}
                style={({ hovered }: any) =>
                  web({ flexDirection: 'row', alignItems: 'center', gap: 16, height: 48, paddingHorizontal: 12,
                    borderRadius: 10, cursor: 'pointer', backgroundColor: hovered ? t.hover : 'transparent' })
                }
              >
                <Ionicons name="time-outline" size={22} color={t.text} />
                <Txt size={16} numberOfLines={1} style={{ flex: 1 }}>{s}</Txt>
                <IconBtn icon="close" label="Remove" size={36} iconSize={20} onPress={() => removeSearch(s)} />
              </Pressable>
            ))
          )}
        </View>
      )}
    </PageScroll>
  );
}
