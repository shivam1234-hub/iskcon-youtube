import React, { useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleProp, Text, TextProps, TextStyle, View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelResult } from '../../data/types';
import { useLibrary } from '../../contexts/LibraryContext';
import { FONT, useT } from './theme';

// Web-only style keys (cursor, transitions...) that RN's types don't know.
export const web = (s: Record<string, any>): any => s;

export function Txt({
  style, dim, mute, size = 14, weight, ...rest
}: TextProps & { dim?: boolean; mute?: boolean; size?: number; weight?: TextStyle['fontWeight'] }) {
  const t = useT();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: FONT, color: dim ? t.textDim : mute ? t.textMute : t.text, fontSize: size },
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}

/** A tooltip shown under (or above) an element on hover, like YouTube's. */
export function Tip({ label, show, up }: { label: string; show: boolean; up?: boolean }) {
  if (!show || !label) return null;
  return (
    <View
      pointerEvents="none"
      style={web({
        position: 'absolute',
        [up ? 'bottom' : 'top']: '100%',
        left: '50%',
        transform: [{ translateX: '-50%' }],
        marginTop: up ? 0 : 8,
        marginBottom: up ? 8 : 0,
        backgroundColor: 'rgba(97,97,97,0.92)',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        zIndex: 1000,
        whiteSpace: 'nowrap',
      })}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontFamily: FONT }}>{label}</Text>
    </View>
  );
}

export function IconBtn({
  icon, onPress, label, size = 40, iconSize = 24, color, style, tipUp, active, disabled,
}: {
  icon: any; onPress?: () => void; label: string; size?: number; iconSize?: number; color?: string;
  style?: StyleProp<ViewStyle>; tipUp?: boolean; active?: boolean; disabled?: boolean;
}) {
  const t = useT();
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [
        web({
          width: size, height: size, borderRadius: size / 2, alignItems: 'center',
          justifyContent: 'center', cursor: disabled ? 'default' : 'pointer',
          transitionDuration: '120ms', transitionProperty: 'background-color', opacity: disabled ? 0.4 : 1,
        }),
        (hover || active) && { backgroundColor: t.hover },
        pressed && { backgroundColor: t.pressed },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={color ?? t.text} />
      <Tip label={label} show={hover} up={tipUp} />
    </Pressable>
  );
}

/** Rounded "tonal" button as on YouTube's watch page (Save, Share...). */
export function Pill({
  icon, label, onPress, active, primary, style, tip, small,
}: {
  icon?: any; label: string; onPress?: () => void; active?: boolean; primary?: boolean;
  style?: StyleProp<ViewStyle>; tip?: string; small?: boolean;
}) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const bg = primary
    ? t.text
    : hover ? t.chipHover : t.chip;
  const fg = primary ? t.bg : t.text;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [
        web({
          flexDirection: 'row', alignItems: 'center', gap: 6, height: small ? 32 : 36,
          paddingHorizontal: small ? 12 : 16, borderRadius: 18, backgroundColor: bg, cursor: 'pointer',
          transitionDuration: '120ms', transitionProperty: 'background-color, opacity',
          opacity: primary && hover ? 0.85 : 1,
        }),
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={small ? 18 : 20} color={active ? t.brand : fg} /> : null}
      <Txt size={small ? 13 : 14} weight="500" style={{ color: fg }}>{label}</Txt>
      {tip ? <Tip label={tip} show={hover} /> : null}
    </Pressable>
  );
}

export function DAvatar({ uri, name, size = 36 }: { uri?: string; name?: string; size?: number }) {
  const t = useT();
  const box = { width: size, height: size, borderRadius: size / 2, backgroundColor: t.raised };
  if (uri) return <Image source={{ uri }} style={box} />;
  const letter = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  // A stable colour per channel name, like YouTube's letter avatars.
  const hues = ['#5c6bc0', '#00897b', '#8e24aa', '#ef6c00', '#3949ab', '#6d4c41', '#c2185b', '#00838f'];
  const h = hues[[...(name ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return (
    <View style={[box, { backgroundColor: h, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#fff', fontSize: size * 0.45, fontFamily: FONT, fontWeight: '500' }}>{letter}</Text>
    </View>
  );
}

export function SubscribePill({ channel, small }: { channel: ChannelResult; small?: boolean }) {
  const { isSubscribed, toggleSubscription } = useLibrary();
  if (!channel.channelId) return null;
  const on = isSubscribed(channel.channelId);
  return (
    <Pill
      small={small}
      primary={!on}
      icon={on ? 'notifications-outline' : undefined}
      label={on ? 'Subscribed' : 'Subscribe'}
      onPress={() => toggleSubscription(channel)}
      tip={on ? 'Unsubscribe' : undefined}
    />
  );
}

export function Spinner({ label, pad = 48 }: { label?: string; pad?: number }) {
  const t = useT();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: pad, gap: 12 }}>
      <ActivityIndicator color={t.textDim} size="large" />
      {label ? <Txt dim size={14}>{label}</Txt> : null}
    </View>
  );
}

export function EmptyState({
  icon, title, text, action,
}: { icon: any; title: string; text?: string; action?: React.ReactNode }) {
  const t = useT();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 24, gap: 10 }}>
      <View
        style={{
          width: 120, height: 120, borderRadius: 60, backgroundColor: t.chip,
          alignItems: 'center', justifyContent: 'center', marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={56} color={t.textDim} />
      </View>
      <Txt size={20} weight="500" style={{ textAlign: 'center' }}>{title}</Txt>
      {text ? <Txt dim size={14} style={{ textAlign: 'center', maxWidth: 440, lineHeight: 20 }}>{text}</Txt> : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't reach YouTube"
      text={`${message}. Check your internet connection.`}
      action={onRetry ? <Pill label="Try again" icon="refresh" onPress={onRetry} /> : undefined}
    />
  );
}

/** YouTube's chip bar. */
export function ChipBar<T extends string>({
  options, value, onChange, style,
}: {
  options: { key: T; label: string }[]; value: T; onChange: (k: T) => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{ gap: 12, alignItems: 'center' }}
    >
      {options.map((o) => (
        <Chip key={o.key} label={o.label} active={o.key === value} onPress={() => onChange(o.key)} />
      ))}
    </ScrollView>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useT();
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={web({
        height: 32, paddingHorizontal: 12, borderRadius: 8, justifyContent: 'center', cursor: 'pointer',
        backgroundColor: active ? t.chipActiveBg : hover ? t.chipHover : t.chip,
        transitionDuration: '120ms', transitionProperty: 'background-color',
      })}
    >
      <Text
        style={{
          fontFamily: FONT, fontSize: 14, fontWeight: '500',
          color: active ? t.chipActiveText : t.text, whiteSpace: 'nowrap',
        } as any}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Thumbnail placeholders while a grid loads. */
export function SkeletonGrid({ cols, width, rows = 3 }: { cols: number; width: number; rows?: number }) {
  const t = useT();
  const w = (width - 16 * (cols - 1)) / cols;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 40 }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <View key={i} style={{ width: w }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: t.skeleton }} />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.skeleton }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ height: 18, width: '90%', borderRadius: 4, backgroundColor: t.skeleton }} />
              <View style={{ height: 14, width: '60%', borderRadius: 4, backgroundColor: t.skeleton }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
