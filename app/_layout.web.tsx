import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '../contexts/SettingsContext';
import { HistoryProvider } from '../contexts/HistoryContext';
import { LibraryProvider } from '../contexts/LibraryContext';
import { DesktopThemeProvider } from '../components/desktop/theme';
import DesktopShell from '../components/desktop/Shell';

/**
 * Desktop (Electron / web) root: same data providers as the phone, but a
 * YouTube-desktop layout — masthead with search, left guide, page area —
 * instead of a stack with a bottom tab bar.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <HistoryProvider>
          <LibraryProvider>
            <DesktopThemeProvider>
              <DesktopShell>
                <Slot />
              </DesktopShell>
            </DesktopThemeProvider>
          </LibraryProvider>
        </HistoryProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
