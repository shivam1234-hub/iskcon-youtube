import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuState, setMenuListener } from '../utils/nav';
import { C } from '../theme/colors';

/** The app's single bottom-sheet menu; opened with openMenu() from utils/nav. */
export default function MenuHost() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setMenuListener(setMenu);
    return () => setMenuListener(null);
  }, []);

  const close = () => setMenu(null);

  return (
    <Modal visible={!!menu} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.handle} />
        {menu && (
          <>
            <Text style={styles.title} numberOfLines={2}>{menu.title}</Text>
            {menu.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{menu.subtitle}</Text> : null}
            <View style={styles.sep} />
            {menu.actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  close();
                  // Let the sheet start closing before a follow-up alert opens.
                  setTimeout(a.run, 150);
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceHi }]}
              >
                <Ionicons name={a.icon as any} size={22} color={a.destructive ? C.live : C.text} />
                <Text style={[styles.label, a.destructive && { color: C.live }]}>{a.label}</Text>
              </Pressable>
            ))}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, marginBottom: 10,
  },
  title: { color: C.text, fontSize: 15, fontWeight: '700', marginHorizontal: 18, lineHeight: 20 },
  subtitle: { color: C.textDim, fontSize: 12.5, marginHorizontal: 18, marginTop: 3 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 18, minHeight: 52 },
  label: { color: C.text, fontSize: 15 },
});
