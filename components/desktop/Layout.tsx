import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import type { VideoResult } from '../../data/types';
import { useT } from './theme';
import { ItemProps, VideoTile } from './VideoItems';

/**
 * A page's scroll area. Reports its inner width (for grid columns) and calls
 * onEnd when the user nears the bottom (infinite scroll).
 */
export function PageScroll({
  children, onEnd, contentStyle, maxWidth, header, scrollRef,
}: {
  scrollRef?: React.RefObject<ScrollView | null>;
  children: (width: number) => React.ReactNode;
  onEnd?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Centre the content in a column of at most this width. */
  maxWidth?: number;
  header?: React.ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const onScroll = useCallback((e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height > contentSize.height - 900) endRef.current?.();
  }, []);
  return (
    <ScrollView
      ref={scrollRef as any}
      style={{ flex: 1 }}
      onScroll={onScroll}
      scrollEventThrottle={100}
      contentContainerStyle={[{ paddingHorizontal: 24, paddingBottom: 48 }, contentStyle]}
    >
      {header}
      <View
        style={{ width: '100%', maxWidth, alignSelf: 'center' }}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {width > 0 ? children(width) : null}
      </View>
    </ScrollView>
  );
}

/** 3–5 columns depending on room, like YouTube's home grid. */
export function columnsFor(width: number, min = 300, maxCols = 5): number {
  return Math.max(2, Math.min(maxCols, Math.floor((width + 16) / (min + 16))));
}

export function VideoGrid({
  videos, width, itemProps, hideChannel, minTile = 300,
}: {
  videos: VideoResult[];
  width: number;
  itemProps?: (v: VideoResult) => Partial<ItemProps>;
  hideChannel?: boolean;
  minTile?: number;
}) {
  const cols = columnsFor(width, minTile);
  const gap = 16;
  const w = Math.floor((width - gap * (cols - 1)) / cols);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap, rowGap: 40 }}>
      {videos.map((v) => (
        <View key={v.videoId} style={{ width: w }}>
          <VideoTile video={v} hideChannel={hideChannel} {...itemProps?.(v)} />
        </View>
      ))}
    </View>
  );
}

export function MoreSpinner({ show }: { show: boolean }) {
  const t = useT();
  if (!show) return null;
  return <ActivityIndicator color={t.textDim} style={{ marginVertical: 32 }} size="large" />;
}
