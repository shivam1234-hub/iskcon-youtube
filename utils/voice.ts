import { NativeModules, Platform } from 'react-native';

/**
 * Opens the phone's speech dialog (Hindi, which also understands English
 * words) and returns what was said, or null if cancelled / unavailable.
 */
export async function listen(): Promise<string | null> {
  const mod = NativeModules.VoiceSearch;
  if (Platform.OS !== 'android' || !mod) return null;
  try {
    const text: string | null = await mod.listen('hi-IN', 'बोलिए…');
    return text?.trim() || null;
  } catch {
    return null;
  }
}
