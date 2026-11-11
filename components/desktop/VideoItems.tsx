import React, { memo, useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoResult, formatDuration, thumbFor } from '../../data/types';
import { useHistory } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { MenuAction, confirmHideChannel, openChannel, openMenu, openVideo } from '../../utils/nav';
import { isHiddenChannel } from '../../utils/iskcon';
import { watchUrl } from '../../utils/youtube';
import { useHiddenVersion } from '../../hooks/useHidden';
import { copyText, toast } from './overlays';
import { FONT, useT } from './theme';
import { DAvatar, IconBtn, Txt, web } from './ui';

export interface ItemProps {
  video: VideoResult;
  onPress?: (v: VideoResult) => void;
  /** Extra menu entry, e.g. "Remove from history". */
  onRemove?: { label: string; run: () => void };
  hideChannel?: boolean;
}

export function copyVideoLink(v: Pick<VideoResult, 'videoId'>) {
  copyText(watchUrl(v.videoId)).then((ok) => toast(ok ? 'Link copied to clipboard' : "Couldn't copy the link"));
}

/** The ⋯ / right-click menu for any video. */
function useVideoMenu(video: VideoResult, onRemove?: ItemProps['onRemove']) {
  const { isSaved, toggleWatchLater, hideChannel } = useLibrary();
  return () => {
    const saved = isSaved(video.videoId);
    const actions: MenuAction[] = [
      {
        label: saved ? 'Remove from Watch later' : 'Save to Watch later',
        icon: saved ? 'bookmark' : 'time-outline',
        run: () => {
          toggleWatchLater(video);
          toast(saved ? 'Removed from Watch later' : 'Saved to Watch later');
        },
      },
      { label: 'Copy link', icon: 'link-outline', run: () => copyVideoLink(video) },
    ];
    if (video.channelId) {
      actions.push({
        label: 'Go to channel',
        icon: 'person-circle-outline',
        run: () => openChannel({ channelId: video.channelId!, title: video.channel, avatar: video.channelAvatar }),
      });
    }
    if (onRemove) actions.push({ label: onRemove.label, icon: 'trash-outline', run: onRemove.run });
    if (video.channelId || video.channel) {
      actions.push({
        label: 'Not interested in this channel',
        icon: 'eye-off-outline',
        destructive: true,
        run: () =>
          confirmHideChannel(video.channel, () => {
            hideChannel({ channelId: video.channelId, title: video.channel });
            toast(`${video.channel || 'Channel'} won't be shown any more`);
          }),
      });
    }
    openMenu({ title: video.title, subtitle: video.channel || undefined, actions });
  };
}

/** Right-click opens the same menu as the ⋯ button. */
function useContextMenu(open: () => void) {
  const ref = useRef<any>(null);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const el: HTMLElement | null = ref.current;
    if (!el?.addEventListener) return;
    const h = (e: MouseEvent) => {
      e.preventDefault();
      openRef.current();
    };
    el.addEventListener('contextmenu', h);
    return () => el.removeEventListener('contextmenu', h);
  }, []);
  return ref;
}

function useProgress(video: VideoResult) {
  const { byId } = useHistory();
  const w = byId.get(video.videoId);
  const d = video.durationSec ?? w?.durationSec ?? null;
  return w && d ? Math.min(1, w.positionSec / d) : 0;
}

export function Thumb({
  video, radius = 12, width, hovered,
}: { video: VideoResult; radius?: number; width?: number | string; hovered?: boolean }) {
  const t = useT();
  const progress = useProgress(video);
  return (
    <View
      style={web({
        width: width ?? '100%', aspectRatio: 16 / 9, borderRadius: hovered ? 0 : radius,
        overflow: 'hidden', backgroundColor: t.skeleton,
        transitionDuration: '200ms', transitionProperty: 'border-radius',
      })}
    >
      <Image
        source={{ uri: video.thumbnail || thumbFor(video.videoId) }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        resizeMode="cover"
      />
      {video.isLive ? (
        <View style={[badge, { backgroundColor: '#cc0000' }]}>
          <Text style={badgeText}>LIVE</Text>
        </View>
      ) : video.durationSec != null ? (
        <View style={badge}>
          <Text style={badgeText}>{formatDuration(video.durationSec)}</Text>
        </View>
      ) : null}
      {progress > 0 ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.4)' }}>
          <View style={{ height: 4, width: `${Math.max(3, progress * 100)}%`, backgroundColor: '#ff0000' }} />
        </View>
      ) : null}
    </View>
  );
}

const badge: any = {
  position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4,
  paddingHorizontal: 4, paddingVertical: 1,
};
const badgeText: any = { color: '#fff', fontSize: 12, fontWeight: '500', fontFamily: FONT, lineHeight: 18 };

function meta(video: VideoResult) {
  return [video.viewsText, video.publishedText].filter(Boolean).join(' • ');
}

/** Home / channel grid tile. */
export const VideoTile = memo(function VideoTile({ video, onPress, onRemove, hideChannel }: ItemProps) {
  const t = useT();
  useHiddenVersion();
  const [hover, setHover] = useState(false);
  const menu = useVideoMenu(video, onRemove);
  const ref = useContextMenu(menu);
  if (isHiddenChannel(video.channelId, video.channel)) return null;
  const goChannel = () =>
    video.channelId && openChannel({ channelId: video.channelId, title: video.channel, avatar: video.channelAvatar });
  return (
    <View ref={ref} style={{ width: '100%' }}>
      <Pressable
        onPress={() => (onPress ? onPress(video) : openVideo(video))}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        style={web({ cursor: 'pointer' })}
      >
        <Thumb video={video} hovered={hover} />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          {!hideChannel ? (
            <Pressable onPress={goChannel} style={web({ cursor: 'pointer' })}>
              <DAvatar uri={video.channelAvatar} name={video.channel} size={36} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
            <Txt size={16} weight="500" numberOfLines={2} style={{ lineHeight: 22 }}>{video.title}</Txt>
            {!hideChannel && video.channel ? (
              <Pressable onPress={goChannel} style={web({ cursor: 'pointer', marginTop: 4, maxWidth: '100%' })}>
                {({ hovered }: any) => (
                  <Txt dim size={14} numberOfLines={1} style={{ color: hovered ? t.text : t.textDim }}>{video.channel}</Txt>
                )}
              </Pressable>
            ) : null}
            <Txt dim size={14} numberOfLines={1} style={{ marginTop: hideChannel ? 4 : 0 }}>{meta(video)}</Txt>
          </View>
          <View style={{ position: 'absolute', right: -10, top: -6, opacity: hover ? 1 : 0 } as any}>
            <IconBtn icon="ellipsis-vertical" label="Action menu" size={36} iconSize={18} onPress={menu} />
          </View>
        </View>
      </Pressable>
    </View>
  );
});

/** Search results / History / Watch later row: large thumbnail on the left. */
export const VideoRow = memo(function VideoRow({
  video, onPress, onRemove, hideChannel, thumbWidth = 360, showDesc,
}: ItemProps & { thumbWidth?: number; showDesc?: boolean }) {
  const t = useT();
  useHiddenVersion();
  const [hover, setHover] = useState(false);
  const menu = useVideoMenu(video, onRemove);
  const ref = useContextMenu(menu);
  if (isHiddenChannel(video.channelId, video.channel)) return null;
  const goChannel = () =>
    video.channelId && openChannel({ channelId: video.channelId, title: video.channel, avatar: video.channelAvatar });
  return (
    <View ref={ref}>
      <Pressable
        onPress={() => (onPress ? onPress(video) : openVideo(video))}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        style={web({ flexDirection: 'row', gap: 16, cursor: 'pointer' })}
      >
        <Thumb video={video} width={thumbWidth} hovered={hover} />
        <View style={{ flex: 1, minWidth: 0, paddingRight: 40 }}>
          <Txt size={18} numberOfLines={2} style={{ lineHeight: 26 }}>{video.title}</Txt>
          <Txt dim size={12} numberOfLines={1} style={{ marginTop: 4 }}>{meta(video)}</Txt>
          {!hideChannel && video.channel ? (
            <Pressable onPress={goChannel} style={web({ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, alignSelf: 'flex-start', cursor: 'pointer' })}>
              {({ hovered }: any) => (
                <>
                  <DAvatar uri={video.channelAvatar} name={video.channel} size={24} />
                  <Txt dim size={12} numberOfLines={1} style={{ color: hovered ? t.text : t.textDim }}>{video.channel}</Txt>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      </Pressable>
      <View
        style={{ position: 'absolute', right: 0, top: 0, opacity: hover ? 1 : 0.0 } as any}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <IconBtn icon="ellipsis-vertical" label="Action menu" size={36} iconSize={18} onPress={menu} />
      </View>
    </View>
  );
});

/** Up next column row: small thumbnail, title, channel, views. */
export const UpNextRow = memo(function UpNextRow({ video, onPress, active }: ItemProps & { active?: boolean }) {
  const t = useT();
  useHiddenVersion();
  const [hover, setHover] = useState(false);
  const menu = useVideoMenu(video);
  const ref = useContextMenu(menu);
  if (isHiddenChannel(video.channelId, video.channel)) return null;
  return (
    <View ref={ref}>
      <Pressable
        onPress={() => (onPress ? onPress(video) : openVideo(video))}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        style={web({
          flexDirection: 'row', gap: 8, cursor: 'pointer', borderRadius: 8,
          backgroundColor: active ? t.chip : 'transparent',
        })}
      >
        <Thumb video={video} width={168} radius={8} />
        <View style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
          <Txt size={14} weight="500" numberOfLines={2} style={{ lineHeight: 20 }}>{video.title}</Txt>
          <Txt dim size={12} numberOfLines={1} style={{ marginTop: 4 }}>{video.channel}</Txt>
          <Txt dim size={12} numberOfLines={1}>{meta(video)}</Txt>
        </View>
      </Pressable>
      <View
        style={{ position: 'absolute', right: -8, top: -4, opacity: hover ? 1 : 0 } as any}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <IconBtn icon="ellipsis-vertical" label="Action menu" size={32} iconSize={16} onPress={menu} />
      </View>
    </View>
  );
});

export { Ionicons };
