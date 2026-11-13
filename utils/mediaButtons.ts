import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

/**
 * Earphone / Bluetooth play-pause buttons for the video player (Android).
 * See MediaButtonsModule.kt: the WebView has no media session of its own.
 */
const mod = Platform.OS === 'android' ? NativeModules.MediaButtons : null;

export function setMediaButtonsState(playing: boolean, title: string) {
  mod?.setState(playing, title);
}

export function releaseMediaButtons() {
  mod?.release();
}

export function onMediaButton(cb: (action: 'play' | 'pause') => void) {
  const sub = DeviceEventEmitter.addListener('VaniMediaButton', cb);
  return () => sub.remove();
}
