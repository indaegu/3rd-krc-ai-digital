package com.mulsigye.app.feature.status.presentation

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.ui.rememberReducedMotion

private const val RAINFALL_MS = 620

/**
 * 메인 헤더 — 로고 탭 = 새로고침(물방울 rainfall 0.62s, 로고 회전 금지),
 * 현재 지역 라벨 + [>] = 지역 설정 이동. 라벨은 응답 값으로만 표시한다.
 *
 * - 아이콘 단독 버튼에는 접근 가능한 이름을 준다(새로고침·지역 설정).
 * - reduced-motion이면 rainfall을 멈춘다(장식 모션 정지).
 * - 터치 목표 48dp 이상.
 */
@Composable
fun MainHeader(
    regionLabel: String?,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onNavigateRegions: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val animate = refreshing && !reducedMotion

    // 물방울이 아래로 흘러내리는 rainfall(0.62s 반복). reduced-motion·비로딩이면 정지(0f).
    val transition = rememberInfiniteTransition(label = "rainfall")
    val fall by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = RAINFALL_MS, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "rainfall-fall",
    )
    val fallProgress = if (animate) fall else 0f

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onRefresh)
                .semantics(mergeDescendants = true) { contentDescription = "새로고침" }
                .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WaterDrop(fallProgress = fallProgress)
            Spacer(Modifier.width(8.dp))
            Text(
                text = "물시계",
                style = MaterialTheme.typography.titleLarge,
                color = Ink,
            )
        }

        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onNavigateRegions)
                .semantics(mergeDescendants = true) { contentDescription = "지역 설정" }
                .sizeIn(minHeight = 48.dp)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = regionLabel ?: "우리 지역",
                style = MaterialTheme.typography.bodyLarge,
                color = Ink3,
            )
            Spacer(Modifier.width(4.dp))
            Chevron()
        }
    }
}

/**
 * 로고 물방울. rainfall 진행도(0..1)에 따라 방울이 아래로 떨어지며 사라졌다 다시 나타난다.
 * 진행도 0이면 정지(정적 방울). 장식이라 접근성 트리에서 제외한다.
 */
@Composable
private fun WaterDrop(fallProgress: Float) {
    Canvas(
        modifier = Modifier
            .size(22.dp)
            .clearAndSetSemantics { },
    ) {
        val w = size.width
        val h = size.height
        val offsetY = h * 0.4f * fallProgress
        val alpha = 1f - fallProgress

        val drop = Path().apply {
            moveTo(w * 0.5f, h * 0.08f + offsetY)
            cubicTo(
                w * 0.9f, h * 0.45f + offsetY,
                w * 0.82f, h * 0.9f + offsetY,
                w * 0.5f, h * 0.9f + offsetY,
            )
            cubicTo(
                w * 0.18f, h * 0.9f + offsetY,
                w * 0.1f, h * 0.45f + offsetY,
                w * 0.5f, h * 0.08f + offsetY,
            )
            close()
        }
        drawPath(path = drop, color = Blue, alpha = alpha.coerceIn(0f, 1f))
    }
}

@Composable
private fun Chevron() {
    Canvas(
        modifier = Modifier
            .size(18.dp)
            .clearAndSetSemantics { },
    ) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w * 0.35f, h * 0.25f)
            lineTo(w * 0.65f, h * 0.5f)
            lineTo(w * 0.35f, h * 0.75f)
        }
        drawPath(
            path = path,
            color = Ink3,
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = w * 0.12f),
        )
    }
}
