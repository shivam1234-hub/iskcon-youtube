import React, { useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HistoryEntry, resumePoint, useHistory } from '../contexts/HistoryContext';
import { useLibrary } from '../contexts/LibraryContext';
import { openVideo } from '../utils/nav';
import { isIskconVideo } from '../utils/iskcon';
import { EmptyState, Pill, Txt, web } from '../components/desktop/ui';
import { PageScroll } from '../components/desktop/Layout';
import { VideoRow } from '../components/desktop/VideoItems';
import { toast } from '../components/desktop/overlays';
import { FONT, useT } from '../components/desktop/theme';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HistoryScreen() {
  const t = useT();
  const { history, remove, clear } = useHistory();
  const { recentSearches, clearSearches } = useLibrary();
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const iskcon = history.filter(isIskconVideo);
    const list = f
      ? iskcon.filter((h) => h.title.toLowerCase().includes(f) || h.channel.toLowerCase().includes(f))
      : iskcon;
    const out: { label: string; items: HistoryEntry[] }[] = [];
    for (const e of list) {
      const label = dayLabel(e.watchedAt);
      if (out.length && out[out.length - 1].label === label) out[out.length - 1].items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [history, filter]);

  const side = (
    <View style={web({ width: 320, gap: 20, position: 'sticky', top: 0, paddingTop: 8 })}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1,
          borderBottomColor: t.border, paddingBottom: 6,
        }}
      >
        <Ionicons name="search-outline" size={20} color={t.text} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Search watch history"
          placeholderTextColor={t.textMute}
          style={web({ flex: 1, height: 32, fontSize: 14, color: t.text, fontFamily: FONT, outlineStyle: 'none' })}
        />
      </View>
      <View style={{ gap: 8, alignItems: 'flex-start' }}>
        <Pill
          icon="trash-outline"
          label="Clear all watch history"
          onPress={() =>
            Alert.alert('Clear watch history?', 'Resume positions are lost too.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clear },
            ])
          }
        />
        <Pill
          icon="search-outline"
          label={`Clear search history (${recentSearches.length})`}
          onPress={() => {
            clearSearches();
            toast('Search history cleared');
          }}
        />
      </View>
    </View>
  );

  return (
    <PageScroll contentStyle={{ paddingTop: 24 }} maxWidth={1284}>
      {() => (
        <View style={{ flexDirection: 'row', gap: 48 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={36} weight="700" style={{ marginBottom: 24 }}>Watch history</Txt>
            {groups.length === 0 ? (
              <EmptyState icon="time-outline" title={filter ? 'No matches' : 'No watch history'} text={filter ? undefined : 'Videos you watch will show up here.'} />
            ) : (
              groups.map((g) => (
                <View key={g.label} style={{ marginBottom: 16 }}>
                  <Txt size={20} weight="700" style={{ marginBottom: 16 }}>{g.label}</Txt>
                  <View style={{ gap: 16 }}>
                    {g.items.map((e) => (
                      <VideoRow
                        key={e.videoId}
                        video={e}
                        thumbWidth={246}
                        onPress={(v) => openVideo(v, resumePoint(e))}
                        onRemove={{ label: 'Remove from watch history', run: () => remove(e.videoId) }}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
          {side}
        </View>
      )}
    </PageScroll>
  );
}
