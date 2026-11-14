package com.relife.android

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.relife.android.health.HealthAccess
import com.relife.android.ui.Actions
import com.relife.android.ui.App
import com.relife.android.ui.ReLifeTheme

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ReLifeTheme { Screen() } }
    }

    @Composable
    private fun Screen() {
        val state by vm.ui.collectAsState()
        val permissions = rememberLauncherForActivityResult(HealthAccess.requestContract()) { vm.refresh() }

        // Coming back from the permission sheet, Settings or the pairing page: look at everything again.
        LifecycleResumeEffect(Unit) {
            vm.refresh()
            if (vm.ui.value.paired) com.relife.android.sync.Sync.now(applicationContext)
            onPauseOrDispose { }
        }

        val actions = remember(state.backgroundAvailable) {
            object : Actions {
                override fun scan() = scanCode()
                override fun typed(address: String) = vm.typed(address)
                override fun cancelPending() = vm.cancelPending()
                override fun allow() = permissions.launch(HealthAccess.permissions + if (state.backgroundAvailable) setOf(HealthAccess.BACKGROUND) else emptySet())
                override fun openPlay() = openHealthConnectInPlay()
                override fun manageAccess() = open(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
                override fun syncNow() = vm.syncNow()
                override fun disconnect() = vm.disconnect()
                override fun confirm() = vm.confirmed()
                override fun dismissConfirm() = vm.dismissConfirm()
                override fun dismissError() = vm.dismissError()
            }
        }
        App(state, actions)
    }

    /** Google's scanner runs in Play services, so the app needs no camera permission. */
    private fun scanCode() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { code -> code.rawValue?.let(vm::scanned) }
            .addOnFailureListener { vm.scanFailed(it.message) }
    }

    private fun openHealthConnectInPlay() {
        val id = "com.google.android.apps.healthdata"
        open(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id&url=healthconnect%3A%2F%2Fonboarding")).setPackage("com.android.vending"))
    }

    private fun open(intent: Intent) {
        try { startActivity(intent) } catch (_: ActivityNotFoundException) { vm.scanFailed("Couldn't open that on this phone.") }
    }
}
