package com.selfservice.kiosk

import android.content.Context
import com.selfservice.core.DefaultDispatchersProvider
import com.selfservice.obd.core.platform.AndroidBluetoothEnvironmentRepository
import com.selfservice.obd.core.platform.BluetoothPrerequisitesMonitor
import com.selfservice.obd.core.platform.BluetoothPrerequisitesUseCase
import com.selfservice.obd.ui.prerequisites.BluetoothPrerequisitePresenter

object BluetoothPrerequisitesEntryPoint {

    @Volatile
    private var overrideFactory: ((Context) -> BluetoothPrerequisitePresenter)? = null

    fun create(context: Context): BluetoothPrerequisitePresenter {
        val factory = overrideFactory
        if (factory != null) {
            return factory(context)
        }
        val repository = AndroidBluetoothEnvironmentRepository(context.applicationContext)
        val useCase = BluetoothPrerequisitesUseCase(repository)
        val monitor = BluetoothPrerequisitesMonitor(useCase, DefaultDispatchersProvider())
        return BluetoothPrerequisitePresenter(useCase, monitor)
    }

    fun override(factory: (Context) -> BluetoothPrerequisitePresenter) {
        overrideFactory = factory
    }

    fun resetOverride() {
        overrideFactory = null
    }
}
