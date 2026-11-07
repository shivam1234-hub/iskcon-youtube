import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VideoCard from '../components/VideoCard';
import { Empty } from '../components/States';
import { HistoryEntry, resumePoint, useHistory } from '../contexts/HistoryContext';
import { openVideo } from '../utils/nav';
import { C } from '../theme/colors';
import { isIskconVideo } from '../utils/iskcon';

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

type Row = { kind: 'head'; label: string } | { kind: 'video'; entry: HistoryEntry };

export default function HistoryScreen() {
  const { history, remove } = useHistory();
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const iskcon = history.filter(isIskconVideo);
    const list = f
      ? iskcon.filter((h) => h.title.toLowerCase().includes(f) || h.channel.toLowerCase().includes(f))
      : iskcon;
    const out: Row[] = [];
    let last = '';
    for (const e of list) {
      const label = dayLabel(e.watchedAt);
      if (label !== last) {
        out.push({ kind: 'head', label });
        last = label;
      }
      out.push({ kind: 'video', entry: e });
    }
    return out;
  }, [history, filter]);

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={17} color={C.textMute} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Search watch history"
          placeholderTextColor={C.textMute}
          style={styles.input}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'head' ? `h:${r.label}` : r.entry.videoId)}
        renderItem={({ item }) =>
          item.kind === 'head' ? (
            <Text style={styles.head}>{item.label}</Text>
          ) : (
            <VideoCard
              video={item.entry}
              variant="compact"
              onPress={(v) => openVideo(v, resumePoint(item.entry))}
              onRemove={{ label: 'Remove from history', run: () => remove(item.entry.videoId) }}
            />
          )
        }
        ListEmptyComponent={
          <Empty icon="time-outline" title={filter ? 'No matches' : 'No watch history'} />
        }
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 12, height: 40,
    borderRadius: 20, backgroundColor: C.surfaceHi,
  },
  input: { flex: 1, color: C.text, fontSize: 14.5, paddingVertical: 0 },
  head: { color: C.text, fontSize: 16, fontWeight: '800', marginHorizontal: 12, marginTop: 14, marginBottom: 6 },
});
