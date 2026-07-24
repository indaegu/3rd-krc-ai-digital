package com.mulsigye.app.core.designsystem.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// 흰 배경·단색 카드·블루 강조. design-system 토큰을 ColorScheme 의미로 옮긴다.
private val MulsigyeColors = lightColorScheme(
    primary = Blue,
    onPrimary = Color.White,
    primaryContainer = BlueTint,
    onPrimaryContainer = BlueDeep,
    secondary = Ink2,
    onSecondary = Color.White,
    background = Bg,
    onBackground = Ink,
    surface = Gray50,
    onSurface = Ink,
    surfaceVariant = Gray100,
    onSurfaceVariant = Ink2,
    outline = Ink3,
    outlineVariant = Gray200,
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
