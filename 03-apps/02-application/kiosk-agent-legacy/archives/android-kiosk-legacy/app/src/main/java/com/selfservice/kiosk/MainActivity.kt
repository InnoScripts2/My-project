package com.selfservice.kiosk

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import androidx.appcompat.app.AlertDialog

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var touchStartTime: Long = 0
    private var touchCount: Int = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Создаём WebView программно
        webView = WebView(this).apply {
            layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        setContentView(webView)

        // Настройки WebView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = true
            allowContentAccess = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        // Жест настройки: 3 пальца 5 секунд
        webView.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    if (event.pointerCount == 3) {
                        touchStartTime = System.currentTimeMillis()
                        touchCount = 3
                    }
                }
                MotionEvent.ACTION_POINTER_DOWN -> {
                    touchCount = event.pointerCount
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (touchCount == 3 &&
                        (System.currentTimeMillis() - touchStartTime) >= 5000) {
                        showUrlDialog()
                    }
                    touchCount = 0
                }
            }
            false
        }

        // Загружаем URL
        val url = getString(R.string.kiosk_url)
        webView.loadUrl(url)
    }

    private fun showUrlDialog() {
        val input = EditText(this)
        input.setText(webView.url)

        AlertDialog.Builder(this)
            .setTitle("Настройка URL")
            .setMessage("Введите новый URL:")
            .setView(input)
            .setPositiveButton("OK") { _, _ ->
                val newUrl = input.text.toString()
                if (newUrl.isNotEmpty()) {
                    webView.loadUrl(newUrl)
                }
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
