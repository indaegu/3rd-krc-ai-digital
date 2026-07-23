package com.mulsigye.app.feature.splash.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.ui.rememberReducedMotion
import kotlinx.coroutines.delay

private const val SPLASH_MS = 1500L

/**
 * 스플래시 — 메인 최초 진입 시 1.5s 오버레이(로고 등장). 게이팅과 별개로 동의·지역이 모두
 * 있는 메인 위에 잠깐 덮는다. reduced-motion이면 대기 없이 즉시 [onDone]으로 통과시켜
 * 장식 모션을 만들지 않는다(design-system 접근성).
 */
@Composable
fun SplashScreen(
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()

    LaunchedEffect(reducedMotion) {
        if (reducedMotion) {
            onDone()
        } else {
            delay(SPLASH_MS)
            onDone()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Canvas(
            modifier = Modifier
                .size(72.dp)
                .clearAndSetSemantics {},
        ) {
            val w = size.width
            val h = size.height
            val drop = Path().apply {
                moveTo(w * 0.5f, h * 0.08f)
                cubicTo(w * 0.9f, h * 0.45f, w * 0.82f, h * 0.9f, w * 0.5f, h * 0.9f)
                cubicTo(w * 0.18f, h * 0.9f, w * 0.1f, h * 0.45f, w * 0.5f, h * 0.08f)
                close()
            }
            drawPath(path = drop, color = Blue)
        }
        Spacer(Modifier.height(16.dp))
        Text(text = "물시계", style = MaterialTheme.typography.displayLarge, color = Ink)
        Spacer(Modifier.height(8.dp))
        Text(
            text = "우리 동네 물 사정, 며칠 앞서",
            style = MaterialTheme.typography.bodyLarge,
            color = Ink3,
        )
    }
}
