package com.vanitube.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Voice search through the phone's own speech dialog (Google), like YouTube's
 * mic button. No microphone permission is needed: the dialog belongs to the
 * Google app, which already has it. Resolves with the best transcript, or
 * null if the user backed out.
 */
class VoiceModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private var pending: Promise? = null

  private val listener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST) return
      val p = pending ?: return
      pending = null
      val text = data
        ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        ?.firstOrNull()
      p.resolve(if (resultCode == Activity.RESULT_OK) text else null)
    }
  }

  init {
    ctx.addActivityEventListener(listener)
  }

  override fun getName() = "VoiceSearch"

  @ReactMethod
  fun listen(language: String, prompt: String, promise: Promise) {
    val activity = ctx.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "App is not in the foreground")
      return
    }
    pending?.resolve(null)
    pending = promise
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
      putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }
    try {
      activity.startActivityForResult(intent, REQUEST)
    } catch (e: ActivityNotFoundException) {
      pending = null
      promise.reject("unavailable", "Voice search is not available on this phone")
    }
  }

  companion object {
    private const val REQUEST = 4711
  }
}
