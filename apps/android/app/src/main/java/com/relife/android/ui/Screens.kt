package com.relife.android.ui

import android.text.format.DateUtils
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import com.relife.android.R
import com.relife.android.Confirm
import com.relife.android.UiState
import com.relife.android.health.HcStatus
import com.relife.android.health.HealthAccess

/** The product name comes from the string resource (written from packages/brand/brand.json), never typed here. */
private val LocalAppName = staticCompositionLocalOf { "" }

/** What the buttons do. The activity owns the scanner, the permission sheet and the intents. */
interface Actions {
    fun scan()
    fun typed(address: String)
    fun cancelPending()
    fun allow()
    fun openPlay()
    fun manageAccess()
    fun syncNow()
    fun disconnect()
    fun confirm()
    fun dismissConfirm()
    fun dismissError()
}

/** One screen. Which part shows is decided by the state, in the order a person meets them. */
@Composable
fun App(state: UiState, actions: Actions) {
    CompositionLocalProvider(LocalAppName provides stringResource(R.string.app_name)) { Screen(state, actions) }
}

@Composable
private fun Screen(state: UiState, actions: Actions) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(LocalAppName.current, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            when {
                !state.paired && state.pending != null -> Waiting(state, actions)
                !state.paired -> NotPaired(state, actions)
                state.hc != HcStatus.Available -> Missing(state.hc, actions)
                !state.canRead -> Permissions(state, actions)
                else -> Ready(state, actions)
            }
            state.error?.let { Problem(it, actions) }
        }
    }
    state.confirm?.let { Insecure(it, actions) }
}

@Composable
private fun Section(title: String? = null, content: @Composable () -> Unit) {
    androidx.compose.material3.Card(
        Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            title?.let { Text(it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
            content()
        }
    }
}

@Composable
private fun Quiet(text: String) = Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun NotPaired(state: UiState, actions: Actions) {
    var address by remember { mutableStateOf("") }
    state.note?.let { Section { Text(it, color = LocalPalette.current.warn) } }
    Section("Send your health data to your ${LocalAppName.current}") {
        Quiet("Steps, sleep, heart rate and workouts go to your own server, not to anyone else. Nothing is sent until you pair.")
        Button({ actions.scan() }, Modifier.fillMaxWidth(), enabled = !state.busy) { Text("Scan code") }
        Quiet("Open \"Use on your phone\" in ${LocalAppName.current} on your computer and scan the code it shows.")
    }
    Section("No code to scan?") {
        OutlinedTextField(
            address, { address = it }, Modifier.fillMaxWidth(), label = { Text("Address") }, placeholder = { Text("192.168.1.20:3030") },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        OutlinedButton({ actions.typed(address) }, Modifier.fillMaxWidth(), enabled = !state.busy && address.isNotBlank()) { Text("Get a code") }
        if (state.busy) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp); Quiet("Connecting…")
        }
    }
}

@Composable
private fun Waiting(state: UiState, actions: Actions) {
    val p = state.pending ?: return
    Section("Approve this phone") {
        Quiet("On your computer, open ${LocalAppName.current} › You › Settings › Devices and approve this code.")
        Text(
            p.userCode, style = MaterialTheme.typography.displaySmall, fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp); Quiet("Waiting for approval on ${p.server.substringAfter("://")}")
        }
        TextButton({ actions.cancelPending() }) { Text("Cancel") }
    }
}

@Composable
private fun Missing(status: HcStatus, actions: Actions) {
    Section("Health Connect needed") {
        when (status) {
            HcStatus.UpdateRequired -> {
                Quiet("Health Connect on this phone needs an update before ${LocalAppName.current} can read from it.")
                Button({ actions.openPlay() }, Modifier.fillMaxWidth()) { Text("Update Health Connect") }
            }
            HcStatus.NotInstalled -> {
                Quiet("${LocalAppName.current} reads your steps and sleep through Health Connect, which isn't installed on this phone.")
                Button({ actions.openPlay() }, Modifier.fillMaxWidth()) { Text("Get Health Connect") }
            }
            else -> Quiet("This phone doesn't support Health Connect, so ${LocalAppName.current} can't read health data here.")
        }
        TextButton({ actions.disconnect() }) { Text("Disconnect") }
    }
}

@Composable
private fun Permissions(state: UiState, actions: Actions) {
    Section("Choose what ${LocalAppName.current} can read") {
        Quiet("Allow any of these. Each one you allow starts syncing; the rest can wait.")
        Quiet("Paired with ${state.serverHost}. ${LocalAppName.current} only reads; it never writes to Health Connect.")
        HealthAccess.labels.forEach { (permission, label) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label)
                val on = permission in state.granted
                Text(if (on) "Allowed" else "Not yet", color = if (on) LocalPalette.current.good else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (state.backgroundAvailable) Quiet("Also allow reading in the background, so it can sync every hour without opening the app.")
        Button({ actions.allow() }, Modifier.fillMaxWidth()) { Text("Allow access") }
    }
    TextButton({ actions.disconnect() }) { Text("Disconnect") }
}

@Composable
private fun Ready(state: UiState, actions: Actions) {
    Section("Connected") {
        Text("Syncing to ${state.serverHost}", fontWeight = FontWeight.Medium)
        val last = state.lastSync
        Text(
            if (last == null) "Not synced yet" else "Last sync ${DateUtils.getRelativeTimeSpanString(last.toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)} · ${state.lastDays} ${if (state.lastDays == 1) "day" else "days"} sent",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        state.note?.let { Text(it, color = LocalPalette.current.warn) }
        Quiet("Syncs about once an hour.")
        Button({ actions.syncNow() }, Modifier.fillMaxWidth()) { Text("Sync now") }
    }
    if (state.missing.isNotEmpty()) Section("Not sent yet") {
        Quiet("These aren't allowed, so ${LocalAppName.current} doesn't read them: ${state.missing.mapNotNull { HealthAccess.labels[it] }.joinToString(", ")}. They're optional.")
        OutlinedButton({ actions.allow() }, Modifier.fillMaxWidth()) { Text("Choose more") }
    }
    if (state.backgroundAvailable && !state.backgroundGranted) Section("Sync without opening the app") {
        Quiet("Background reading is off, so ${LocalAppName.current} only syncs when you open it.")
        OutlinedButton({ actions.allow() }, Modifier.fillMaxWidth()) { Text("Allow background sync") }
    }
    Section("Your data") {
        OutlinedButton({ actions.manageAccess() }, Modifier.fillMaxWidth()) { Text("Manage access in Health Connect") }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Quiet("Disconnecting stops syncing and removes this phone from your server. Data already sent stays there.")
        TextButton({ actions.disconnect() }) { Text("Disconnect", color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun Problem(message: String, actions: Actions) {
    Section {
        Text(message, color = MaterialTheme.colorScheme.error)
        TextButton({ actions.dismissError() }) { Text("Dismiss") }
    }
}

@Composable
private fun Insecure(confirm: Confirm, actions: Actions) {
    AlertDialog(
        onDismissRequest = { actions.dismissConfirm() },
        title = { Text("Not encrypted") },
        text = { Text("${confirm.server.substringAfter("://")} doesn't use HTTPS, so what you send could be read by others on this network. Only continue on a network you trust.") },
        confirmButton = { TextButton({ actions.confirm() }) { Text("Continue anyway") } },
        dismissButton = { TextButton({ actions.dismissConfirm() }) { Text("Cancel") } },
    )
}
