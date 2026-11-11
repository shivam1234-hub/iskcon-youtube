import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLibrary } from '../../contexts/LibraryContext';
import { suggest } from '../../utils/youtube';
import { cleanSuggestion, iskconSuggestPrefix, isIskconText } from '../../utils/iskcon';
import { openChannel } from '../../utils/nav';
import { DialogHost, MenuPopoverHost, ToastHost, installDesktopPatches } from './overlays';
import { FONT, useT } from './theme';
import { DAvatar, IconBtn, Txt, web } from './ui';

installDesktopPatches();

/** Below this the guide becomes a slim icon rail (as on youtube.com). */
const WIDE = 1312;
export const MASTHEAD_H = 56;

interface ShellCtx {
  /** Pages call this so the shell can hide the guide on the watch page. */
  guideWidth: number;
}
const Ctx = createContext<ShellCtx>({ guideWidth: 0 });
export const useShell = () => useContext(Ctx);

// ---------------------------------------------------------------------------
// Global CSS: fonts, scrollbars, focus rings.

function useGlobalCss(dark: boolean, bg: string) {
  useEffect(() => {
    if (!document.getElementById('yt-font')) {
      const l = document.createElement('link');
      l.id = 'yt-font';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap';
      document.head.appendChild(l);
    }
    let s = document.getElementById('yt-css') as HTMLStyleElement | null;
    if (!s) {
      s = document.createElement('style');
      s.id = 'yt-css';
      document.head.appendChild(s);
    }
    const thumb = dark ? '#717171' : '#909090';
    s.textContent = `
      html, body { background: ${bg}; color-scheme: ${dark ? 'dark' : 'light'}; }
      body { overflow: hidden; }
      * { scrollbar-width: thin; scrollbar-color: ${thumb} transparent; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: transparent; border-radius: 8px; }
      *:hover::-webkit-scrollbar-thumb { background: ${thumb}; }
      :focus { outline: none; }
      :focus-visible { outline: 2px solid ${dark ? '#3ea6ff' : '#1c62b9'}; outline-offset: 2px; border-radius: 6px; }
      input::placeholder { color: ${dark ? '#888' : '#888'}; }
      ::selection { background: ${dark ? '#3ea6ff55' : '#1c62b944'}; }
      img { user-select: none; -webkit-user-drag: none; }
    `;
    document.title = 'YouTube';
  }, [dark, bg]);
}

// ---------------------------------------------------------------------------
// Search box with suggestions and recent searches.

function SearchBox() {
  const t = useT();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ q?: string }>();
  const { recentSearches, addSearch, removeSearch } = useLibrary();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sel, setSel] = useState(-1);
  const inputRef = useRef<TextInput>(null);

  // Show the query being looked at on the results page.
  useEffect(() => {
    if (pathname === '/results' && params.q) setText(String(params.q));
  }, [pathname, params.q]);

  // Ctrl+K / Ctrl+F / "/" focus the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping();
      if (((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) || (!typing && e.key === '/')) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (!q || !open) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      suggest(iskconSuggestPrefix(q), ctrl.signal)
        .then((list) =>
          setSuggestions(
            list.filter(isIskconText).map(cleanSuggestion).filter((v, i, a) => a.indexOf(v) === i),
          ),
        )
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, open]);

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return recentSearches.slice(0, 12);
    return [
      ...recentSearches.filter((r) => r.toLowerCase().startsWith(q)).slice(0, 3),
      ...suggestions,
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 12);
  }, [text, suggestions, recentSearches]);

  useEffect(() => setSel(-1), [rows.length, text]);

  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    addSearch(query);
    setText(query);
    setOpen(false);
    inputRef.current?.blur();
    router.push({ pathname: '/results', params: { q: query } });
  };

  const onKeyPress = (e: any) => {
    const k = e.nativeEvent.key;
    if (k === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setSel((s) => Math.min(rows.length - 1, s + 1));
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(-1, s - 1));
    } else if (k === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (k === 'Enter') {
      submit(sel >= 0 ? rows[sel] : text);
    }
  };

  const showDrop = open && focused && rows.length > 0;

  return (
    <View style={{ flex: 1, maxWidth: 640, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, position: 'relative' }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', height: 40, borderWidth: 1,
            borderColor: focused ? (t.dark ? '#1c62b9' : '#1c62b9') : t.searchBorder,
            borderTopLeftRadius: 20, borderBottomLeftRadius: 20, borderRightWidth: 0,
            backgroundColor: t.searchBg, paddingLeft: focused ? 12 : 16, paddingRight: 4, gap: 10,
            marginLeft: focused ? 0 : 32,
          }}
        >
          {focused ? <Ionicons name="search-outline" size={18} color={t.text} /> : null}
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyPress={onKeyPress}
            placeholder="Search"
            placeholderTextColor={t.textMute}
            style={web({
              flex: 1, height: 38, fontSize: 16, color: t.text, fontFamily: FONT, outlineStyle: 'none',
            })}
            autoCorrect={false}
            accessibilityLabel="Search YouTube"
          />
          {text ? (
            <IconBtn icon="close" label="Clear search" size={34} iconSize={22} onPress={() => {
              setText('');
              inputRef.current?.focus();
            }} />
          ) : null}
        </View>
        {showDrop ? (
          <View
            style={web({
              position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: t.menu,
              borderRadius: 12, paddingVertical: 16, zIndex: 1500,
              boxShadow: '0 4px 32px rgba(0,0,0,0.2)',
            })}
          >
            {rows.map((r, i) => {
              const recent = recentSearches.includes(r);
              return (
                <Pressable
                  key={r}
                  onPress={() => submit(r)}
                  onHoverIn={() => setSel(i)}
                  style={web({
                    flexDirection: 'row', alignItems: 'center', gap: 14, height: 32,
                    paddingLeft: 16, paddingRight: 8, cursor: 'pointer',
                    backgroundColor: sel === i ? t.hover : 'transparent',
                  })}
                >
                  <Ionicons name={recent ? 'time-outline' : 'search-outline'} size={20} color={t.text} />
                  <Txt size={16} weight="500" numberOfLines={1} style={{ flex: 1 }}>{r}</Txt>
                  {recent && sel === i ? (
                    <Pressable
                      onPress={(e: any) => {
                        e.stopPropagation?.();
                        removeSearch(r);
                      }}
                      style={web({ cursor: 'pointer', paddingHorizontal: 6 })}
                    >
                      <Txt size={13} style={{ color: t.link }}>Remove</Txt>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={() => submit(text)}
        accessibilityLabel="Search"
        style={({ hovered }: any) =>
          web({
            width: 64, height: 40, borderWidth: 1, borderColor: t.searchBorder,
            borderTopRightRadius: 20, borderBottomRightRadius: 20,
            backgroundColor: hovered ? (t.dark ? '#303030' : '#f0f0f0') : t.searchBtn,
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          })
        }
      >
        <Ionicons name="search-outline" size={22} color={t.text} />
      </Pressable>
    </View>
  );
}

export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function Logo({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="YouTube Home"
      style={web({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, height: 40, cursor: 'pointer' })}
    >
      <Image source={require('../../assets/logo-wide.png')} style={{ width: 29, height: 20 }} />
      <Txt
        size={20}
        weight="700"
        style={web({ letterSpacing: -1.1, color: t.text, fontFamily: '"Roboto", Arial, sans-serif' })}
      >
        YouTube
      </Txt>
    </Pressable>
  );
}

function Masthead({ onMenu }: { onMenu: () => void }) {
  const t = useT();
  return (
    <View
      style={{
        height: MASTHEAD_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        backgroundColor: t.bg, zIndex: 100,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', width: 220 }}>
        <IconBtn icon="menu" label="Menu" onPress={onMenu} />
        <Logo onPress={() => router.navigate('/')} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 24 }}>
        <View style={{ width: '100%', maxWidth: 732, flexDirection: 'row', justifyContent: 'center' }}>
          <SearchBox />
        </View>
      </View>
      <View style={{ width: 220, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
        <IconBtn icon="time-outline" label="History" onPress={() => router.navigate('/history')} />
        <IconBtn icon="person-circle-outline" label="You" onPress={() => router.navigate('/library')} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Guide (left navigation)

interface Entry {
  key: string;
  label: string;
  icon: string;
  iconOn: string;
  href: string;
}

const MAIN: Entry[] = [
  { key: '/', label: 'Home', icon: 'home-outline', iconOn: 'home', href: '/' },
  { key: '/subscriptions', label: 'Subscriptions', icon: 'albums-outline', iconOn: 'albums', href: '/subscriptions' },
];
const YOU: Entry[] = [
  { key: '/history', label: 'History', icon: 'time-outline', iconOn: 'time', href: '/history' },
  { key: '/watch-later', label: 'Watch later', icon: 'bookmark-outline', iconOn: 'bookmark', href: '/watch-later' },
  { key: '/library?view=hidden', label: 'Hidden channels', icon: 'eye-off-outline', iconOn: 'eye-off', href: '/library?view=hidden' },
  { key: '/library?view=settings', label: 'Settings', icon: 'settings-outline', iconOn: 'settings', href: '/library?view=settings' },
];

function useActiveKey(): string {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ view?: string }>();
  if (pathname === '/library' && params.view) return `/library?view=${params.view}`;
  return pathname;
}

function GuideItem({ e, active, onGo }: { e: Entry; active: boolean; onGo: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={() => {
        onGo();
        router.navigate(e.href as any);
      }}
      style={({ hovered }: any) =>
        web({
          flexDirection: 'row', alignItems: 'center', gap: 24, height: 40, paddingHorizontal: 12,
          borderRadius: 10, cursor: 'pointer',
          backgroundColor: active ? (hovered ? t.chipHover : t.chip) : hovered ? t.hover : 'transparent',
        })
      }
    >
      <Ionicons name={(active ? e.iconOn : e.icon) as any} size={24} color={t.text} />
      <Txt size={14} weight={active ? '500' : '400'} numberOfLines={1}>{e.label}</Txt>
    </Pressable>
  );
}

function Guide({ onGo }: { onGo: () => void }) {
  const t = useT();
  const active = useActiveKey();
  const { subscriptions } = useLibrary();
  const [all, setAll] = useState(false);
  const subs = all ? subscriptions : subscriptions.slice(0, 7);
  const sep = <View style={{ height: 1, backgroundColor: t.border, marginVertical: 12, marginHorizontal: 12 }} />;
  return (
    <View style={{ width: 240, flexShrink: 0 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 }}>
      {MAIN.map((e) => <GuideItem key={e.key} e={e} active={active === e.key} onGo={onGo} />)}
      {sep}
      <Pressable
        onPress={() => {
          onGo();
          router.navigate('/library');
        }}
        style={({ hovered }: any) =>
          web({
            flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12,
            borderRadius: 10, cursor: 'pointer',
            backgroundColor: active === '/library' ? t.chip : hovered ? t.hover : 'transparent',
          })
        }
      >
        <Txt size={16} weight="500">You</Txt>
        <Ionicons name="chevron-forward" size={16} color={t.text} />
      </Pressable>
      {YOU.map((e) => <GuideItem key={e.key} e={e} active={active === e.key} onGo={onGo} />)}
      {sep}
      <Txt size={16} weight="500" style={{ paddingHorizontal: 12, paddingVertical: 6 }}>Subscriptions</Txt>
      {subscriptions.length === 0 ? (
        <Txt dim size={13} style={{ paddingHorizontal: 12, paddingVertical: 6, lineHeight: 18 }}>
          Channels you subscribe to appear here.
        </Txt>
      ) : null}
      {subs.map((s) => (
        <Pressable
          key={s.channelId}
          onPress={() => {
            onGo();
            openChannel(s);
          }}
          style={({ hovered }: any) =>
            web({
              flexDirection: 'row', alignItems: 'center', gap: 24, height: 40, paddingHorizontal: 12,
              borderRadius: 10, cursor: 'pointer', backgroundColor: hovered ? t.hover : 'transparent',
            })
          }
        >
          <DAvatar uri={s.avatar} name={s.title} size={24} />
          <Txt size={14} numberOfLines={1} style={{ flex: 1 }}>{s.title}</Txt>
        </Pressable>
      ))}
      {subscriptions.length > 7 ? (
        <Pressable
          onPress={() => setAll((a) => !a)}
          style={({ hovered }: any) =>
            web({
              flexDirection: 'row', alignItems: 'center', gap: 24, height: 40, paddingHorizontal: 12,
              borderRadius: 10, cursor: 'pointer', backgroundColor: hovered ? t.hover : 'transparent',
            })
          }
        >
          <Ionicons name={all ? 'chevron-up' : 'chevron-down'} size={24} color={t.text} />
          <Txt size={14}>{all ? 'Show fewer' : `Show ${subscriptions.length - 7} more`}</Txt>
        </Pressable>
      ) : null}
    </ScrollView>
    </View>
  );
}

function MiniGuide() {
  const t = useT();
  const active = useActiveKey();
  const items: Entry[] = [
    ...MAIN,
    { key: '/library', label: 'You', icon: 'person-circle-outline', iconOn: 'person-circle', href: '/library' },
    YOU[0],
  ];
  return (
    <View style={{ width: 72, flexShrink: 0, paddingHorizontal: 4, paddingTop: 4 }}>
      {items.map((e) => {
        const on = active === e.key;
        return (
          <Pressable
            key={e.key}
            onPress={() => router.navigate(e.href as any)}
            style={({ hovered }: any) =>
              web({
                height: 74, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: 'pointer', backgroundColor: hovered ? t.hover : 'transparent',
              })
            }
          >
            <Ionicons name={(on ? e.iconOn : e.icon) as any} size={24} color={t.text} />
            <Txt size={10} numberOfLines={1}>{e.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The shell

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const onWatch = pathname.startsWith('/watch');
  const wide = width >= WIDE;
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useGlobalCss(t.dark, t.bg);

  // Drawer closes on navigation.
  useEffect(() => setDrawer(false), [pathname]);

  // Back: Alt+Left, or Backspace outside a text field. Esc closes the drawer.
  useEffect(() => {
    (window as any).__nav = (p: string) => router.push(p as any);
    const onKey = (e: KeyboardEvent) => {
      if ((e.altKey && e.key === 'ArrowLeft') || (e.key === 'Backspace' && !isTyping())) {
        e.preventDefault();
        if (router.canGoBack()) router.back();
        else router.navigate('/');
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        window.history.forward();
      } else if (e.key === 'Escape') {
        setDrawer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    // Mouse back/forward buttons.
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        if (router.canGoBack()) router.back();
      } else if (e.button === 4) {
        e.preventDefault();
        window.history.forward();
      }
    };
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, []);

  const mode: 'full' | 'mini' | 'none' = onWatch ? 'none' : wide && !collapsed ? 'full' : 'mini';
  const onMenu = useCallback(() => {
    if (mode === 'none' || !wide) setDrawer((d) => !d);
    else setCollapsed((c) => !c);
  }, [mode, wide]);

  const guideWidth = mode === 'full' ? 240 : mode === 'mini' ? 72 : 0;

  return (
    <Ctx.Provider value={{ guideWidth }}>
      <View style={web({ height: '100vh', backgroundColor: t.bg, overflow: 'hidden' })}>
        <Masthead onMenu={onMenu} />
        <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
          {mode === 'full' ? <Guide onGo={() => {}} /> : mode === 'mini' ? <MiniGuide /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        </View>
        {drawer ? (
          <View style={web({ position: 'fixed', inset: 0, zIndex: 1200 })}>
            <Pressable
              onPress={() => setDrawer(false)}
              style={web({ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', cursor: 'default' })}
            />
            <View style={web({ position: 'absolute', left: 0, top: 0, bottom: 0, width: 240, backgroundColor: t.bg })}>
              <View style={{ height: MASTHEAD_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                <IconBtn icon="menu" label="Menu" onPress={() => setDrawer(false)} />
                <Logo onPress={() => router.navigate('/')} />
              </View>
              <Guide onGo={() => setDrawer(false)} />
            </View>
          </View>
        ) : null}
        <MenuPopoverHost />
        <DialogHost />
        <ToastHost />
      </View>
    </Ctx.Provider>
  );
}
