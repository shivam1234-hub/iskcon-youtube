import { Alert, Share } from 'react-native';
import { router } from 'expo-router';
import type { ChannelResult, VideoResult } from '../data/types';
import { watchUrl } from './youtube';

/**
 * Open the watch screen. The listing's metadata rides along as JSON so the
 * title, channel and thumbnail show instantly while details load.
 */
export function openVideo(v: VideoResult, startSec?: number) {
  router.push({
    pathname: '/watch/[id]',
    params: {
      id: v.videoId,
      v: JSON.stringify(v),
      ...(startSec ? { t: String(Math.floor(startSec)) } : {}),
    },
  });
}

export function openChannel(c: Pick<ChannelResult, 'channelId' | 'title'> & Partial<ChannelResult>) {
  if (!c.channelId) return;
  router.push({
    pathname: '/channel/[id]',
    params: { id: c.channelId, title: c.title ?? '', avatar: c.avatar ?? '' },
  });
}

export function shareVideo(v: Pick<VideoResult, 'videoId' | 'title'>) {
  Share.share({ message: `${v.title}\n${watchUrl(v.videoId)}` }).catch(() => {});
}

export interface MenuAction {
  label: string;
  icon: string;
  run: () => void;
  destructive?: boolean;
}

export interface MenuState {
  title: string;
  subtitle?: string;
  actions: MenuAction[];
}

// One bottom sheet for the whole app (components/MenuHost.tsx), rather than a
// Modal inside every row.
let menuListener: ((m: MenuState | null) => void) | null = null;
export const setMenuListener = (l: typeof menuListener) => {
  menuListener = l;
};
export const openMenu = (m: MenuState) => menuListener?.(m);

/** Ask before hiding: it removes a whole channel from the app. */
export function confirmHideChannel(name: string, run: () => void) {
  Alert.alert(
    `Not interested in ${name || 'this channel'}?`,
    'No video from this channel will be shown anywhere, and you will be unsubscribed. You can undo this on the You tab under Hidden channels.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Hide channel', style: 'destructive', onPress: run },
    ],
  );
}

/** Long-press menu on any video row. */
export function showVideoMenu(
  v: VideoResult,
  opts: {
    saved: boolean;
    toggleSave: () => void;
    hideChannel: () => void;
    onRemove?: { label: string; run: () => void };
  },
) {
  const actions: MenuAction[] = [
    {
      label: opts.saved ? 'Remove from Watch later' : 'Save to Watch later',
      icon: opts.saved ? 'bookmark' : 'bookmark-outline',
      run: opts.toggleSave,
    },
    { label: 'Share', icon: 'arrow-redo-outline', run: () => shareVideo(v) },
  ];
  if (v.channelId) {
    actions.push({
      label: 'Go to channel',
      icon: 'person-circle-outline',
      run: () => openChannel({ channelId: v.channelId!, title: v.channel, avatar: v.channelAvatar }),
    });
  }
  if (opts.onRemove) {
    actions.push({ label: opts.onRemove.label, icon: 'trash-outline', run: opts.onRemove.run });
  }
  if (v.channelId || v.channel) {
    actions.push({
      label: 'Not interested in this channel',
      icon: 'eye-off-outline',
      destructive: true,
      run: () => confirmHideChannel(v.channel, opts.hideChannel),
    });
  }
  openMenu({ title: v.title, subtitle: v.channel || undefined, actions });
}
