import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '../contexts/SettingsContext';
import { HistoryProvider } from '../contexts/HistoryContext';
import { LibraryProvider } from '../contexts/LibraryContext';
import { C } from '../theme/colors';
import MenuHost from '../components/MenuHost';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <HistoryProvider>
            <LibraryProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: C.bg },
                  headerTintColor: C.text,
                  headerTitleStyle: { fontSize: 17, fontWeight: '700' },
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: C.bg },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                {/* These draw their own headers. */}
                <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name="results" options={{ headerShown: false }} />
                <Stack.Screen name="watch/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="channel/[id]" options={{ title: '' }} />
                <Stack.Screen name="history" options={{ title: 'History' }} />
                <Stack.Screen name="watch-later" options={{ title: 'Watch later' }} />
              </Stack>
              <MenuHost />
            </LibraryProvider>
          </HistoryProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
