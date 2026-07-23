package com.mulsigye.app.core.designsystem.component

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.ui.rememberReducedMotion

/**
 * 모듈별 스켈레톤 로딩 블록(design-system 로딩 패턴). 풀스크린 스피너 대신 쓴다.
 *
 * OS "애니메이션 삭제"(reduced-motion)에서는 흐르는 하이라이트를 멈추고 정적 회색으로 둔다.
 * 장식이므로 접근성 트리에서 제외한다.
 */
@Composable
fun Shimmer(
    modifier: Modifier = Modifier,
    cornerRadius: Int = 12,
) {
    val reducedMotion = rememberReducedMotion()
    val shape = RoundedCornerShape(cornerRadius.dp)

    val translate = if (reducedMotion) {
        0f
    } else {
        val transition = rememberInfiniteTransition(label = "shimmer")
        val animated by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1000f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 1300, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "shimmer-translate",
        )
        animated
    }

    val brush = Brush.linearGradient(
        colors = listOf(Gray100, Gray200, Gray100),
        start = Offset(translate - 300f, 0f),
        end = Offset(translate, 0f),
    )

    Box(
        modifier = modifier
            .clearAndSetSemantics {}
            .background(brush = brush, shape = shape),
    )
}
