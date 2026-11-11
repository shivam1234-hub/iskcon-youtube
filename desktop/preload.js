'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the web bundle and Electron. The shared code only
 * reaches for it behind a `window.desktop` check, so the same bundle still
 * runs in a plain browser.
 */
function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const info = ipcRenderer.sendSync('desktop:info');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: info.platform,
  version: info.version,
  /** YouTube data requests, made by the main process (no CORS there). */
  net: { request: (req) => ipcRenderer.invoke('net:request', req) },
  clipboard: { write: (text) => ipcRenderer.invoke('clipboard:write', text) },
  media: {
    hold: (on) => ipcRenderer.invoke('media:hold', on),
    onKey: (cb) => subscribe('media:key', cb),
  },
  float: {
    open: (opts) => ipcRenderer.invoke('float:open', opts),
    close: () => ipcRenderer.invoke('float:close'),
    onClosed: (cb) => subscribe('float:closed', cb),
    onEnded: (cb) => subscribe('float:ended', cb),
    // Used by the mini player window itself.
    report: (state) => ipcRenderer.send('float:state', state),
    backToApp: () => ipcRenderer.invoke('float:backToApp'),
  },
  onWindow: (cb) => subscribe('app:window', cb),
  focusMain: () => ipcRenderer.invoke('window:focus'),
});
