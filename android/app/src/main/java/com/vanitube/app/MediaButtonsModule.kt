package com.vanitube.app

import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Earphone / Bluetooth buttons for the video player.
 *
 * Videos play inside a WebView, which owns no media session, so Android had
 * nowhere to send headset button presses. This holds a plain framework
 * MediaSession while a video is open and reports play / pause presses to JS
 * as "VaniMediaButton" events; the watch screen then drives the player.
 * The default Callback.onMediaButtonEvent already turns the single
 * PLAY_PAUSE / HEADSETHOOK button into onPlay or onPause from our state.
 */
class MediaButtonsModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private var session: MediaSession? = null

  override fun getName() = "MediaButtons"

  private fun emit(action: String) {
    if (!ctx.hasActiveReactInstance()) return
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("VaniMediaButton", action)
  }

  private fun ensureSession(): MediaSession =
    session ?: MediaSession(ctx, "ISKCONYouTube").also { s ->
      s.setCallback(object : MediaSession.Callback() {
        override fun onPlay() = emit("play")
        override fun onPause() = emit("pause")
        override fun onStop() = emit("pause")
      })
      session = s
    }

  /** Call whenever the video starts or pauses. */
  @ReactMethod
  fun setState(playing: Boolean, title: String?) {
    UiThreadUtil.runOnUiThread {
      val s = ensureSession()
      s.setMetadata(
        MediaMetadata.Builder()
          .putString(MediaMetadata.METADATA_KEY_TITLE, title ?: "")
          .build()
      )
      s.setPlaybackState(
        PlaybackState.Builder()
          .setActions(
            PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
              PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP
          )
          .setState(
            if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
            PlaybackState.PLAYBACK_POSITION_UNKNOWN,
            if (playing) 1f else 0f
          )
          .build()
      )
      s.isActive = true
    }
  }

  /** Call when leaving the video. */
  @ReactMethod
  fun release() {
    UiThreadUtil.runOnUiThread {
      session?.isActive = false
      session?.release()
      session = null
    }
  }

  override fun invalidate() {
    release()
    super.invalidate()
  }
}
