import React, { useEffect, useState } from 'react';
import { Alert, AlertButton, Pressable, Share, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MenuState, setMenuListener } from '../../utils/nav';
import { FONT, useT } from './theme';
import { Txt, web } from './ui';

// ---------------------------------------------------------------------------
// Tiny global stores (one host each, rendered by the desktop shell).

type Listener<T> = (v: T) => void;
function store<T>(initial: T) {
  let value = initial;
  const ls = new Set<Listener<T>>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      ls.forEach((l) => l(v));
    },
    use(): T {
      const [v, setV] = useState(value);
      useEffect(() => {
        ls.add(setV);
        return () => {
          ls.delete(setV);
        };
      }, []);
      return v;
    },
  };
}

// Where the last click / right-click happened: menus open there.
const pointer = { x: 0, y: 0 };
if (typeof document !== 'undefined') {
  const track = (e: MouseEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  };
  document.addEventListener('pointerdown', track, true);
  document.addEventListener('contextmenu', track, true);
}

const menuStore = store<(MenuState & { x: number; y: number }) | null>(null);
const toastStore = store<{ text: string; id: number } | null>(null);
interface DialogState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}
const dialogStore = store<DialogState | null>(null);

export function toast(text: string) {
  const id = Date.now();
  toastStore.set({ text, id });
  setTimeout(() => {
    if (toastStore.get()?.id === id) toastStore.set(null);
  }, 3200);
}

export async function copyText(text: string): Promise<boolean> {
  const d = (window as any).desktop;
  try {
    if (d?.clipboard) await d.clipboard.write(text);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The shared screens use Alert.alert (a no-op on react-native-web) and
 * Share.share (navigator.share, absent in Electron). Give both a desktop
 * body once, so utils/nav.ts works unchanged: confirmations become an
 * in-app dialog, Share copies the link.
 */
let installed = false;
export function installDesktopPatches() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    dialogStore.set({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
  };
  (Share as any).share = async (content: { message?: string; url?: string }) => {
    const text = content.url || content.message || '';
    // The shared code puts "title\nurl" in message; copying just the link is
    // what a desktop user expects.
    const link = text.match(/https?:\/\/\S+/)?.[0] ?? text;
    const ok = await copyText(link);
    toast(ok ? 'Link copied to clipboard' : "Couldn't copy the link");
    return { action: 'sharedAction' };
  };
}

// ---------------------------------------------------------------------------
// Hosts

export function MenuPopoverHost() {
  const t = useT();
  const menu = menuStore.use();
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    setMenuListener((m) => menuStore.set(m ? { ...m, x: pointer.x, y: pointer.y } : null));
    return () => setMenuListener(null);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => menuStore.set(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  if (!menu) return null;
  const W = 280;
  const H = 52 + menu.actions.length * 40;
  const left = Math.max(8, Math.min(menu.x - W + 24, width - W - 8));
  const top = menu.y + H + 8 > height ? Math.max(8, menu.y - H - 4) : menu.y + 4;

  return (
    <View style={web({ position: 'fixed', inset: 0, zIndex: 2000 })}>
      <Pressable style={web({ position: 'absolute', inset: 0, cursor: 'default' })} onPress={() => menuStore.set(null)} />
      <View
        style={web({
          position: 'absolute', left, top, width: W, backgroundColor: t.menu, borderRadius: 12,
          paddingVertical: 8, boxShadow: '0 4px 32px rgba(0,0,0,0.25)',
          borderWidth: t.dark ? 0 : 0, animationDuration: '120ms',
        })}
      >
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 2 }}>
          <Txt size={13} weight="500" numberOfLines={1}>{menu.title}</Txt>
          {menu.subtitle ? <Txt size={12} dim numberOfLines={1}>{menu.subtitle}</Txt> : null}
        </View>
        <View style={{ height: 1, backgroundColor: t.border, marginBottom: 8 }} />
        {menu.actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              menuStore.set(null);
              a.run();
            }}
            style={({ hovered }: any) =>
              web({
                flexDirection: 'row', alignItems: 'center', gap: 16, height: 40, paddingHorizontal: 16,
                backgroundColor: hovered ? t.hover : 'transparent', cursor: 'pointer',
              })
            }
          >
            <Ionicons name={a.icon as any} size={22} color={t.text} />
            <Txt size={14}>{a.label}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function DialogHost() {
  const t = useT();
  const d = dialogStore.use();

  const press = (b?: AlertButton) => {
    dialogStore.set(null);
    (b?.onPress as undefined | (() => void))?.();
  };

  useEffect(() => {
    if (!d) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') press(d.buttons.find((b) => b.style === 'cancel'));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [d]);

  if (!d) return null;
  return (
    <View
      style={web({
        position: 'fixed', inset: 0, zIndex: 3000, backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
      })}
    >
      <View
        style={web({
          width: 420, maxWidth: '90%', backgroundColor: t.menu, borderRadius: 12, padding: 24,
          boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        })}
      >
        <Txt size={18} weight="500" style={{ lineHeight: 26 }}>{d.title}</Txt>
        {d.message ? <Txt dim size={14} style={{ marginTop: 12, lineHeight: 21 }}>{d.message}</Txt> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          {d.buttons.map((b, i) => {
            const primary = b.style !== 'cancel';
            return (
              <Pressable
                key={i}
                onPress={() => press(b)}
                style={({ hovered }: any) =>
                  web({
                    height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center',
                    cursor: 'pointer',
                    backgroundColor: primary
                      ? hovered ? (t.dark ? '#65b8ff' : '#0556bf') : t.link
                      : hovered ? t.hover : 'transparent',
                  })
                }
              >
                <Text
                  style={{
                    fontFamily: FONT, fontSize: 14, fontWeight: '500',
                    color: primary ? (t.dark ? '#0f0f0f' : '#fff') : t.link,
                  }}
                >
                  {b.text ?? 'OK'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function ToastHost() {
  const msg = toastStore.use();
  if (!msg) return null;
  return (
    <View
      pointerEvents="none"
      style={web({
        position: 'fixed', left: 24, bottom: 24, zIndex: 3500, backgroundColor: '#0f0f0f',
        borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      })}
    >
      <Text style={{ color: '#fff', fontFamily: FONT, fontSize: 14 }}>{msg.text}</Text>
    </View>
  );
}
