/** A video row, from search, a channel page, related videos or the local library. */
export interface VideoResult {
  videoId: string;
  title: string;
  channel: string;
  channelId?: string;
  channelAvatar?: string;
  durationSec: number | null;
  /** "3 days ago", "Streamed 1 month ago" — YouTube's own relative text. */
  publishedText?: string;
  /** "1.2M views" */
  viewsText?: string;
  thumbnail?: string;
  isLive?: boolean;
}

/** A channel row in search results, and an entry in the subscription list. */
export interface ChannelResult {
  channelId: string;
  title: string;
  avatar?: string;
  /** "@handle" when known. */
  handle?: string;
  subscribersText?: string;
  videoCountText?: string;
}

export type SearchItem =
  | ({ kind: 'video' } & VideoResult)
  | ({ kind: 'channel' } & ChannelResult);

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Stable thumbnail for any video id, when a listing didn't carry one. */
export const thumbFor = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
