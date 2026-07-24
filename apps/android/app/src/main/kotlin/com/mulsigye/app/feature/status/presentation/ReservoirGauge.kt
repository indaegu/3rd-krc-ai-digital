package com.mulsigye.app.feature.status.presentation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueSoft
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.ui.rememberReducedMotion
import kotlin.math.sin

/**
 * 메인 게이지 — 대표 저수지 원저수율(rate)만 물 양으로 보여준다(두 저수율 분리 원칙).
 *
 * - 가뭄 단계 눈금을 겹치지 않는다: 단계 임계는 지역 avgRatio 기준이라 축이 다르다.
 * - 물 출렁임 = 회전 타원 2겹(7s / 11s reverse), 수위 0→목표 1.6s.
 * - OS "애니메이션 삭제"(reduced-motion)에서는 출렁임을 멈추고 수위를 즉시 목표로 둔다.
 * - 값·단계 텍스트는 TodayCard가 소유하므로 게이지는 장식이다: clearAndSetSemantics로
 *   접근성 트리에서 지워 스크린리더가 수치를 중복해 읽지 않게 한다.
 */
@Composable
fun ReservoirGauge(
    rate: Double?,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val target = ((rate ?: 0.0).coerceIn(0.0, 100.0)).toFloat()

    // 수위 0 → 목표 채움(1.6s). reduced-motion이면 즉시 목표 높이로 스냅한다.
    val level = remember { Animatable(0f) }
    LaunchedEffect(target, reducedMotion) {
        if (reducedMotion) {
            level.snapTo(target)
        } else {
            level.snapTo(0f)
            level.animateTo(target, tween(durationMillis = 1600, easing = FastOutSlowInEasing))
        }
    }

    // 물 표면 출렁임 위상 2겹. reduced-motion이면 위상을 고정해 정지시킨다.
    val transition = rememberInfiniteTransition(label = "wave")
    val phaseA by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2f * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 7000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "wave-a",
    )
    val phaseB by transition.animateFloat(
        initialValue = (2f * Math.PI).toFloat(),
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 11000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "wave-b",
    )
    val waveA = if (reducedMotion) 0f else phaseA
    val waveB = if (reducedMotion) 0f else phaseB

    Canvas(
        modifier = modifier
            .size(width = 74.dp, height = 196.dp)
            .clearAndSetSemantics { },
    ) {
        val w = size.width
        val h = size.height
        val radius = w * 0.28f

        // 비이커 배경(빈 물통).
        drawRoundedContainer(color = Gray100, radius = radius)

        val fillFraction = (level.value / 100f).coerceIn(0f, 1f)
        if (fillFraction <= 0f) {
            return@Canvas
        }
        val surfaceY = h * (1f - fillFraction)
        val amplitude = if (reducedMotion) 0f else h * 0.018f

        val container = Path().apply {
            addRoundRect(
                androidx.compose.ui.geometry.RoundRect(
                    left = 0f,
                    top = 0f,
                    right = w,
                    bottom = h,
                    radiusX = radius,
                    radiusY = radius,
                ),
            )
        }
        clipPath(container) {
            // 뒤 물결(옅은 파랑).
            drawWave(surfaceY = surfaceY, phase = waveB, amplitude = amplitude, color = BlueSoft, width = w, height = h)
            // 앞 물결(주 파랑).
            drawWave(surfaceY = surfaceY + amplitude, phase = waveA, amplitude = amplitude, color = Blue, width = w, height = h)
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawRoundedContainer(
    color: androidx.compose.ui.graphics.Color,
    radius: Float,
) {
    drawRoundRect(
        color = color,
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius, radius),
        size = Size(size.width, size.height),
    )
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawWave(
    surfaceY: Float,
    phase: Float,
    amplitude: Float,
    color: androidx.compose.ui.graphics.Color,
    width: Float,
    height: Float,
) {
    val path = Path()
    val step = 4f
    path.moveTo(0f, surfaceY)
    var x = 0f
    while (x <= width) {
        val y = surfaceY + amplitude * sin((x / width) * (2f * Math.PI).toFloat() * 2f + phase)
        path.lineTo(x, y)
        x += step
    }
    path.lineTo(width, height)
    path.lineTo(0f, height)
    path.close()
    drawPath(path = path, color = color)
}
