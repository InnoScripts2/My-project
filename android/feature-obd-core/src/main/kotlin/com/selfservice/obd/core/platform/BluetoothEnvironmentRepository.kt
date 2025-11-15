package com.selfservice.obd.core.platform

import android.content.Context
import android.os.Build
import com.selfservice.core.permissions.BluetoothEnvironmentEvaluator
import com.selfservice.core.permissions.BluetoothEnvironmentState
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothEnvironmentStatusDecider

interface BluetoothEnvironmentRepository {
    fun snapshot(): BluetoothEnvironmentState
    fun status(): BluetoothEnvironmentStatus
}

class AndroidBluetoothEnvironmentRepository(
    private val context: Context,
    private val apiLevelProvider: () -> Int = { Build.VERSION.SDK_INT },
    private val evaluator: (Context, Int) -> BluetoothEnvironmentState = { ctx, api ->
        BluetoothEnvironmentEvaluator.evaluate(ctx, api)
    }
) : BluetoothEnvironmentRepository {

    override fun snapshot(): BluetoothEnvironmentState = evaluate()

    override fun status(): BluetoothEnvironmentStatus {
        return BluetoothEnvironmentStatusDecider.decide(evaluate())
    }

    private fun evaluate(): BluetoothEnvironmentState {
        return evaluator(context, apiLevelProvider())
    }
}
