package com.relife.android.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color

/** Colors Material has no slot for. */
data class Palette(val good: Color, val warn: Color, val pillWash: Color, val hairline: Color)

val LocalPalette = staticCompositionLocalOf { Palette(Color.Unspecified, Color.Unspecified, Color.Unspecified, Color.Unspecified) }

/** Material3's slots filled from the generated tokens, so the app follows the same light and dark looks as the web. */
@Composable
fun ReLifeTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    fun ThemeColor.c() = of(dark)
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        background = Tokens.bg.c(), onBackground = Tokens.ink.c(),
        surface = Tokens.surface.c(), onSurface = Tokens.ink.c(),
        surfaceVariant = Tokens.surface2.c(), onSurfaceVariant = Tokens.ink2.c(),
        surfaceContainer = Tokens.surface.c(), surfaceContainerHigh = Tokens.surface2.c(), surfaceContainerHighest = Tokens.surface3.c(),
        primary = Tokens.pillInk.c(), onPrimary = Tokens.bg.c(),
        primaryContainer = Tokens.pillWash.c(), onPrimaryContainer = Tokens.pillInk.c(),
        outline = Tokens.ink3.c(), outlineVariant = Tokens.hairline.c(),
        error = Tokens.bad.c(), onError = Tokens.bg.c(),
    )
    val shapes = Shapes(
        small = RoundedCornerShape(Tokens.radiusSm), medium = RoundedCornerShape(Tokens.radiusMd),
        large = RoundedCornerShape(Tokens.radiusLg), extraLarge = RoundedCornerShape(Tokens.radiusXl),
    )
    CompositionLocalProvider(LocalPalette provides Palette(Tokens.good.c(), Tokens.warn.c(), Tokens.pillWash.c(), Tokens.hairline.c())) {
        MaterialTheme(colorScheme = scheme, shapes = shapes, content = content)
    }
}
