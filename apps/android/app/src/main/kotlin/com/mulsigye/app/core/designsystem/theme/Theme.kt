package com.mulsigye.app.core.designsystem.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val MulsigyeColors = lightColorScheme(
    primary = Blue,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    background = androidx.compose.ui.graphics.Color.White,
    onBackground = Ink,
    surface = Gray50,
    onSurface = Ink,
)

@Composable
fun MulsigyeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MulsigyeColors,
        typography = MulsigyeTypography,
        shapes = MulsigyeShapes,
        content = content,
    )
}
