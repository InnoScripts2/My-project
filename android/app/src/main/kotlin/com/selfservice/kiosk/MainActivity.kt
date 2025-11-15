package com.selfservice.kiosk

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.core.view.isVisible
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPrerequisiteAction
import com.selfservice.core.permissions.BluetoothPrerequisiteCommand
import com.selfservice.kiosk.databinding.ActivityMainBinding
import com.selfservice.obd.ui.prerequisites.BluetoothPrerequisitePresenter
import com.selfservice.obd.ui.prerequisites.BluetoothPrerequisiteUiState
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val webView: WebView get() = binding.webView

    private var touchStartTime: Long = 0
    private var touchPointerCount: Int = 0
    private lateinit var prerequisiteStatusContainerView: View
    private lateinit var prerequisiteStatusTextView: TextView
    private lateinit var prerequisiteStatusHintView: TextView
    private lateinit var prerequisitesPresenter: BluetoothPrerequisitePresenter
    private var prerequisitesJob: Job? = null
    private var lastPrerequisiteSignature: Pair<BluetoothEnvironmentStatus, BluetoothPrerequisiteAction>? = null
    private var lastExecutedCommand: BluetoothPrerequisiteCommand = BluetoothPrerequisiteCommand.None
    private var lastAccessibilityAnnouncement: String? = null

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        // State monitor will re-emit; command deduplication prevents loops.
    }

    private val enableBluetoothLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Monitor refreshes prerequisites on subsequent polling iteration.
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prerequisiteStatusContainerView = binding.root.findViewById(R.id.prerequisiteStatusContainer)
        prerequisiteStatusTextView = binding.root.findViewById(R.id.prerequisiteStatusText)
        prerequisiteStatusHintView = binding.root.findViewById(R.id.prerequisiteStatusHint)

        // Allow operator to tap the overlay to force a manual re-check of prerequisites.
        prerequisiteStatusContainerView.setOnClickListener { performManualPrerequisiteEvaluation() }
        ViewCompat.replaceAccessibilityAction(
            prerequisiteStatusContainerView,
            AccessibilityNodeInfoCompat.AccessibilityActionCompat.ACTION_CLICK,
            getString(R.string.bluetooth_prereq_retry_accessibility_action)
        ) { _, _ -> performManualPrerequisiteEvaluation() }

        webView.settings.configure()
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.setOnTouchListener(::handleTouch)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        finish()
                    }
                }
            }
        )

        val kioskUrl = getString(R.string.kiosk_url)
        webView.loadUrl(kioskUrl)

        setupBluetoothPrerequisites()
    }

    private fun WebSettings.configure() {
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

    private fun handleTouch(@Suppress("UNUSED_PARAMETER") view: View, event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                if (event.pointerCount == 3) {
                    touchStartTime = System.currentTimeMillis()
                    touchPointerCount = 3
                }
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                touchPointerCount = event.pointerCount
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (touchPointerCount == 3 &&
                    System.currentTimeMillis() - touchStartTime >= GESTURE_HOLD_MS
                ) {
                    showUrlDialog()
                }
                touchPointerCount = 0
            }
        }
        return false
    }

    private fun showUrlDialog() {
        val input = EditText(this).apply { setText(webView.url) }

        AlertDialog.Builder(this)
            .setTitle(R.string.kiosk_url_dialog_title)
            .setMessage(R.string.kiosk_url_dialog_message)
            .setView(input)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val newUrl = input.text.toString()
                if (newUrl.isNotEmpty()) {
                    webView.loadUrl(newUrl)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun setupBluetoothPrerequisites() {
        prerequisitesPresenter = BluetoothPrerequisitesEntryPoint.create(applicationContext)

        handlePrerequisiteState(prerequisitesPresenter.evaluate())

        prerequisitesJob = lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                prerequisitesPresenter.observe().collect { state ->
                    handlePrerequisiteState(state)
                }
            }
        }
    }

    private fun handlePrerequisiteState(state: BluetoothPrerequisiteUiState) {
        val signature = state.status to state.action
        if (signature == lastPrerequisiteSignature) {
            return
        }
        lastPrerequisiteSignature = signature

        updatePrerequisiteOverlay(state)

        if (state.isReady) {
            lastExecutedCommand = BluetoothPrerequisiteCommand.None
            return
        }
        executePrerequisiteCommand(state.command)
    }

    private fun executePrerequisiteCommand(command: BluetoothPrerequisiteCommand) {
        if (command == BluetoothPrerequisiteCommand.None) {
            lastExecutedCommand = BluetoothPrerequisiteCommand.None
            return
        }
        if (command == lastExecutedCommand) {
            return
        }
        lastExecutedCommand = command
        when (command) {
            is BluetoothPrerequisiteCommand.RequestPermissions -> {
                if (command.permissions.isNotEmpty()) {
                    requestPermissionsLauncher.launch(command.permissions)
                }
            }
            is BluetoothPrerequisiteCommand.StartActivityForResult -> {
                enableBluetoothLauncher.launch(command.intent)
            }
            is BluetoothPrerequisiteCommand.StartActivity -> {
                startActivity(command.intent)
            }
            BluetoothPrerequisiteCommand.None -> Unit
        }
    }

    private fun updatePrerequisiteOverlay(state: BluetoothPrerequisiteUiState) {
        if (state.isReady) {
            prerequisiteStatusContainerView.isVisible = false
            prerequisiteStatusContainerView.isClickable = false
            prerequisiteStatusContainerView.isFocusable = false
            prerequisiteStatusHintView.isVisible = false
            prerequisiteStatusContainerView.contentDescription = null
            lastAccessibilityAnnouncement = null
            return
        }
        val message = statusMessage(state)
        val hint = getString(R.string.bluetooth_prereq_retry_hint)
        prerequisiteStatusTextView.text = message
        prerequisiteStatusHintView.text = hint
        prerequisiteStatusHintView.isVisible = true
        prerequisiteStatusContainerView.isVisible = true
        prerequisiteStatusContainerView.isClickable = true
        prerequisiteStatusContainerView.isFocusable = true
        val combinedDescription = "$message $hint"
        prerequisiteStatusContainerView.contentDescription = combinedDescription
        announcePrerequisiteState(combinedDescription)
    }

    private fun statusMessage(state: BluetoothPrerequisiteUiState): String {
        return when (state.status) {
            BluetoothEnvironmentStatus.Ready -> getString(R.string.bluetooth_prereq_ready)
            is BluetoothEnvironmentStatus.MissingPermissions -> getString(R.string.bluetooth_prereq_missing_permissions)
            BluetoothEnvironmentStatus.BluetoothDisabled -> getString(R.string.bluetooth_prereq_enable_bluetooth)
            BluetoothEnvironmentStatus.LocationDisabled -> getString(R.string.bluetooth_prereq_enable_location)
        }
    }

    private fun performManualPrerequisiteEvaluation(): Boolean {
        if (!::prerequisitesPresenter.isInitialized) {
            return false
        }
        val state = prerequisitesPresenter.evaluate()
        handlePrerequisiteState(state)
        return true
    }

    private fun announcePrerequisiteState(description: String) {
        if (description == lastAccessibilityAnnouncement) {
            return
        }
        if (prerequisiteStatusContainerView.isVisible) {
            prerequisiteStatusContainerView.announceForAccessibility(description)
            lastAccessibilityAnnouncement = description
        }
    }

    override fun onDestroy() {
        prerequisitesJob?.cancel()
        prerequisitesJob = null
        super.onDestroy()
    }

    companion object {
        private const val GESTURE_HOLD_MS = 5_000L
    }
}
