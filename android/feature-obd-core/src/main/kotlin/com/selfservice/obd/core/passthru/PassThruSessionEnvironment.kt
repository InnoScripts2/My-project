package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleAdapterSelector
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.platform.BluetoothPrerequisitesUseCase
import com.selfservice.obd.core.recovery.BleReconnectCoordinator
import com.selfservice.obd.core.session.BleSessionStateMachine
import com.selfservice.obd.core.session.DefaultObdSessionController
import com.selfservice.obd.core.session.ObdSessionController
import com.selfservice.obd.core.session.telemetry.ObdSessionTelemetry

/** Bundles PassThru session dependencies and exposes a ready-to-use manager/controller pair. */
class PassThruSessionEnvironment(
        dispatchers: DispatchersProvider,
        bridgeProvider: () -> PassThruNativeBridge,
        transportConfig: PassThruTransportFactoryConfig = PassThruTransportFactoryConfig(),
        defaultScanner: BleScannerConfig = BleScannerConfig.Default,
        retryCount: Int = 3,
        reconnectDelayMs: Long = 2_000L,
        sessionTimeouts: BleSessionStateMachine.SessionTimeouts =
                BleSessionStateMachine.SessionTimeouts(),
        reconnectCoordinator: BleReconnectCoordinator = BleReconnectCoordinator(),
        adapterSelector: BleAdapterSelector = BleAdapterSelector.Empty,
        telemetry: ObdSessionTelemetry = ObdSessionTelemetry.NoOp,
        prerequisitesUseCase: BluetoothPrerequisitesUseCase? = null,
        timeProvider: () -> Long = { System.currentTimeMillis() },
        controllerBuilder: () -> ObdSessionController = {
            DefaultObdSessionController(
                    dispatchers = dispatchers,
                    timeouts = sessionTimeouts,
                    reconnectCoordinator = reconnectCoordinator,
                    timeProvider = timeProvider,
                    adapterSelector = adapterSelector,
                    telemetry = telemetry,
                    prerequisitesUseCase = prerequisitesUseCase
            )
        }
) {

    val controller: ObdSessionController = controllerBuilder()

    val configFactory: PassThruSessionConfigFactory =
            PassThruSessionConfigFactory(
                    dispatchers = dispatchers,
                    bridgeProvider = bridgeProvider,
                    transportConfig = transportConfig,
                    defaultScanner = defaultScanner,
                    retryCount = retryCount,
                    reconnectDelayMs = reconnectDelayMs
            )

    val manager: PassThruSessionManager =
            PassThruSessionManager(controller = controller, configFactory = configFactory)
}
