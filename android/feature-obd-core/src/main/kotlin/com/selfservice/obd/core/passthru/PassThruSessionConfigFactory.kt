package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.connection.TransportFactory
import com.selfservice.obd.core.session.ConnectedAdapter
import com.selfservice.obd.core.session.ObdSessionConfig
import com.selfservice.obd.core.transport.ObdTransport

/** Creates [ObdSessionConfig] instances preconfigured for PassThru diagnostics. */
class PassThruSessionConfigFactory(
        private val dispatchers: DispatchersProvider,
        private val bridgeProvider: () -> PassThruNativeBridge,
        private val transportConfig: PassThruTransportFactoryConfig =
                PassThruTransportFactoryConfig(),
        private val defaultScanner: BleScannerConfig = BleScannerConfig.Default,
        private val retryCount: Int = DEFAULT_RETRY_COUNT,
        private val reconnectDelayMs: Long = DEFAULT_RECONNECT_DELAY_MS
) {

    private val transportFactory: TransportFactory by lazy {
        PassThruTransportFactory(
                dispatchers = dispatchers,
                bridgeProvider = bridgeProvider,
                config = transportConfig
        )
    }

    fun create(
            initialAdapter: ConnectedAdapter? = null,
            scannerConfig: BleScannerConfig = defaultScanner
    ): ObdSessionConfig {
        return ObdSessionConfig(
                scanner = scannerConfig,
                retryCount = retryCount,
                reconnectDelayMs = reconnectDelayMs,
                initialAdapter = initialAdapter,
                transportFactory = transportFactory
        )
    }

    suspend fun prepareSession(
            adapter: ConnectedAdapter,
            scannerConfig: BleScannerConfig = defaultScanner
    ): SessionBootstrap {
        val config = create(initialAdapter = adapter, scannerConfig = scannerConfig)
        val transport = transportFactory.create(adapter.device)
        return SessionBootstrap(config = config, transport = transport)
    }

    fun transportFactory(): TransportFactory = transportFactory

    data class SessionBootstrap(val config: ObdSessionConfig, val transport: ObdTransport)

    companion object {
        private const val DEFAULT_RETRY_COUNT = 3
        private const val DEFAULT_RECONNECT_DELAY_MS = 2_000L
    }
}
