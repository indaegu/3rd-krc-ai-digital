package com.mulsigye.app.feature.status.presentation

import android.graphics.Paint
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.stageColorFor
import com.mulsigye.app.core.ui.rememberReducedMotion
import com.mulsigye.app.feature.status.domain.StageBand
import kotlin.math.sin

/**
 * 메인 게이지 — 지역 평년 대비 저수율(avgRatio)을 물 높이로 보여준다.
 *
 * - 물 색 = 현재 공인 가뭄 단계 색(정상 초록 → 심각 빨강, [stageColorFor]). avgRatio·단계·게이지가
 *   같은 축으로 정합한다. 원저수율(rate)은 TodayCard의 작은 보조 줄이 소유한다(두 저수율 분리).
 * - 단계 눈금 = 서버 [stageBands](정상 70 / 관심 60 / 주의 50 / 경계 40). 각 경계에 옅은 선과 단계
 *   라벨을 그려 "어느 정도면 관심/경계"를 읽게 한다. **임계값은 클라이언트에 두지 않고 서버 값만
 *   쓴다**(규칙 10). stageBands가 null(구 페이로드)이면 눈금 없이 채움만 그린다.
 * - 물 출렁임 = 사인 물결 2겹(7s / 11s reverse), 수위 0→목표 1.6s.
 * - OS "애니메이션 삭제"(reduced-motion)에서는 출렁임을 멈추고 수위를 즉시 목표로 둔다.
 * - 값·단계 텍스트는 TodayCard가 소유하므로 게이지는 장식이다: clearAndSetSemantics로 접근성
 *   트리에서 지워 스크린리더가 수치·눈금 라벨을 중복해 읽지 않게 한다.
 */
@Composable
fun ReservoirGauge(
    avgRatio: Double?,
    stageCode: String,
    stageBands: List<StageBand>? = null,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val target = gaugeFillPercent(avgRatio)
    val water = stageColorFor(stageCode)

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

        val fillFraction = (level.value / 100f).coerceIn(0f, 1f)
        if (fillFraction > 0f) {
            val surfaceY = h * (1f - fillFraction)
            val amplitude = if (reducedMotion) 0f else h * 0.018f
            clipPath(container) {
                // 뒤 물결(단계 배경색) → 앞 물결(단계 전경색). 물 색 = 현재 단계 색.
                drawWave(surfaceY = surfaceY, phase = waveB, amplitude = amplitude, color = water.bg, width = w, height = h)
                drawWave(surfaceY = surfaceY + amplitude, phase = waveA, amplitude = amplitude, color = water.fg, width = w, height = h)
            }
        }

        // 단계 눈금 — 서버 stageBands가 있을 때만. 없으면(구 페이로드) 채움만 그린다.
        if (stageBands != null) {
            clipPath(container) {
                drawStageBands(stageBands, width = w, height = h)
            }
        }
    }
}

/** avgRatio(평년 대비 %)를 0~100 채움 스케일로 정규화한다. 100 초과는 만수(100). null은 0. */
internal fun gaugeFillPercent(avgRatio: Double?): Float =
    (avgRatio ?: 0.0).coerceIn(0.0, 100.0).toFloat()

/**
 * 단계 경계선의 "위에서부터" y 비율(0=상단, 1=하단). 각 단계 하한(minRatio)이 0<..<100인 경계만
 * 그린다(정상 100·심각 0은 통 테두리와 겹쳐 선을 두지 않는다). 임계값은 서버 stageBands에서만 온다.
 */
internal fun zoneLineFractionsFromTop(bands: List<StageBand>?): List<Float> =
    bands.orEmpty()
        .map { it.minRatio }
        .filter { it > 0.0 && it < 100.0 }
        .map { (1.0 - it / 100.0).toFloat() }

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawStageBands(
    bands: List<StageBand>,
    width: Float,
    height: Float,
) {
    // 경계선 — 옅은 잉크색(색만으로 단계를 나누지 않도록 라벨을 함께 둔다).
    val lineColor = Color(0x29191F28)
    for (fraction in zoneLineFractionsFromTop(bands)) {
        val y = height * fraction
        drawLine(
            color = lineColor,
            start = androidx.compose.ui.geometry.Offset(0f, y),
            end = androidx.compose.ui.geometry.Offset(width, y),
            strokeWidth = 1f,
        )
    }
    // 단계 라벨 — 각 밴드 중앙 높이에 오른쪽 정렬. 정상→심각 순서(상한은 한 단계 위 하한, 정상은 100).
    val paint = Paint().apply {
        color = Ink3.toArgb()
        textSize = height * 0.052f
        textAlign = Paint.Align.RIGHT
        isAntiAlias = true
        isFakeBoldText = true
    }
    bands.forEachIndexed { index, band ->
        val upper = if (index == 0) 100.0 else bands[index - 1].minRatio
        val center = (band.minRatio + upper) / 2.0
        val y = height * (1f - (center / 100.0).toFloat())
        drawContext.canvas.nativeCanvas.drawText(
            band.label,
            width - width * 0.06f,
            y + paint.textSize * 0.35f,
            paint,
        )
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
