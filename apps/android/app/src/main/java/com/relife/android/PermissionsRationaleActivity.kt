package com.relife.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.relife.android.ui.ReLifeTheme

/** Health Connect opens this from its permission sheet ("Privacy policy"). Without it, the permission request fails. */
class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ReLifeTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.safeDrawingPadding().padding(24.dp)) {
                        Text("Why this app reads your health data", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "\nSteps, active calories, heart rate, resting heart rate, weight, sleep and exercise are read from Health Connect " +
                                "and sent only to the server you paired this phone with, so your habits and goals can see them.\n\n" +
                                "Nothing is written back to Health Connect, and nothing goes to anyone else. Disconnect in the app, or remove " +
                                "access in Health Connect, at any time.",
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }
        }
    }
}
