package com.selfservice.obd.core.platform

import com.selfservice.core.DispatchersProvider
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPrerequisiteAction
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.currentCoroutineContext

class BluetoothPrerequisitesMonitor(
    private val useCase: BluetoothPrerequisitesUseCase,
    private val dispatchers: DispatchersProvider,
    private val pollIntervalMillis: Long = DEFAULT_POLL_INTERVAL_MILLIS
) {

    fun observe(): Flow<BluetoothPrerequisiteResult> {
        return flow {
            var lastStatus: BluetoothEnvironmentStatus? = null
            var lastAction: BluetoothPrerequisiteAction? = null
            while (currentCoroutineContext().isActive) {
                val result = useCase.evaluate()
                val statusChanged = lastStatus != result.status
                val actionChanged = lastAction != result.action
                if (lastStatus == null || statusChanged || actionChanged) {
                    emit(result)
                    lastStatus = result.status
                    lastAction = result.action
                }
                delay(pollIntervalMillis)
            }
        }.flowOn(dispatchers.computation)
    }

    companion object {
        private const val DEFAULT_POLL_INTERVAL_MILLIS = 1_000L
    }
}
