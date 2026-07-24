package com.mulsigye.app.core.designsystem.component

import androidx.compose.animation.core.FastOutSlowInEasing
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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.ui.rememberReducedMotion

/**
 * 모듈별 스켈레톤 로딩 블록. 풀스크린 스피너 대신 실제 콘텐츠 자리를 회색 블록으로 채운다.
 *
 * TDS(토스 디자인 시스템) 스켈레톤을 참고해, 빛이 지나가는 그라디언트 대신 회색 블록이
 * 은은하게 밝아졌다 어두워지는 호흡(pulse) 애니메이션을 쓴다(더 차분한 로딩 인상).
 * OS "애니메이션 삭제"(reduced-motion)에서는 정적 회색으로 둔다. 장식이라 접근성 트리에서 제외한다.
 */
@Composable
fun Shimmer(
    modifier: Modifier = Modifier,
    cornerRadius: Int = 8,
) {
    val reducedMotion = rememberReducedMotion()
    val shape = RoundedCornerShape(cornerRadius.dp)

    val alpha = if (reducedMotion) {
        0.6f
    } else {
        val transition = rememberInfiniteTransition(label = "skeleton")
        val animated by transition.animateFloat(
            initialValue = 1f,
            targetValue = 0.35f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 900, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "skeleton-alpha",
        )
        animated
    }

    Box(
        modifier = modifier
            .clearAndSetSemantics {}
            .background(color = Gray200.copy(alpha = alpha), shape = shape),
    )
}
