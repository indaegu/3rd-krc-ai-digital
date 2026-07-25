package com.mulsigye.app.feature.splash.presentation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutBack
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.R
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.brandGradientBrush
import com.mulsigye.app.core.ui.rememberReducedMotion
import kotlinx.coroutines.delay

private const val SPLASH_MS = 1500L

// 등장 애니메이션 구간(합계 ≤ SPLASH_MS): 로고가 스케일·페이드로 등장 → 잠깐 머무름 → 부드러운 페이드아웃.
private const val ENTER_MS = 620
private const val HOLD_MS = 520L
private const val EXIT_MS = 340

/**
 * 스플래시 / 화면 전환 — 메인을 처음 보여줄 때 1.5s 오버레이한다. 지역 설정에서 "시작하기"를
 * 눌러 메인으로 넘어갈 때도 이 화면이 전환 연출을 맡는다.
 *
 * 외관은 디자인 시안 그대로: 전체 브랜드 그라디언트 배경 + 태그라인 + 로고(물방울 윤곽 +
 * "수신호" 워드마크, `brand_logo` 에셋). 애니메이션은 태그라인이 살짝 위로 올라오며 페이드인하고,
 * 로고가 가볍게 커지며(오버슈트) 나타난 뒤 전체가 부드럽게 페이드아웃해 메인으로 이어진다.
 *
 * reduced-motion이면 최종 상태를 정적으로 보여주고 모션을 만들지 않으며, 대기 없이 즉시
 * [onDone]으로 통과시킨다(design-system 접근성). onDone 타이밍/콜백 계약은 유지한다.
 */
@Composable
fun SplashScreen(
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()

    // reduced-motion이면 최종 상태(완전히 보임)로 초기화해 정적으로 렌더한다. 아니면 0에서 등장한다.
    val enter = remember { Animatable(if (reducedMotion) 1f else 0f) }
    val exit = remember { Animatable(1f) }

    // onDone 타이밍은 기존과 동일: reduced-motion이면 즉시, 아니면 SPLASH_MS 뒤에 통과.
    LaunchedEffect(reducedMotion) {
        if (reducedMotion) {
            onDone()
        } else {
            delay(SPLASH_MS)
            onDone()
        }
    }

    // 시각 시퀀스는 onDone과 분리해 구동한다(콜백 타이밍을 건드리지 않음). reduced-motion이면 실행 안 함.
    LaunchedEffect(reducedMotion) {
        if (!reducedMotion) {
            enter.animateTo(1f, animationSpec = tween(durationMillis = ENTER_MS, easing = EaseOutBack))
            delay(HOLD_MS)
            exit.animateTo(0f, animationSpec = tween(durationMillis = EXIT_MS, easing = EaseOutCubic))
        }
    }

    // enter는 EaseOutBack이라 1을 잠깐 넘어설 수 있어(살짝 튀는 느낌) 스케일에 그대로 쓰고,
    // 페이드·이동량은 0..1로 제한해 계산한다.
    val entrance = enter.value
    val fadeIn = entrance.coerceIn(0f, 1f)
    val logoScale = 0.86f + 0.14f * entrance

    Column(
        modifier = modifier
            .fillMaxSize()
            // 전체 브랜드 그라디언트 배경(시안: 스플래시·온보딩 전체 배경).
            .background(brandGradientBrush())
            // 전체 콘텐츠를 마지막에 부드럽게 페이드아웃해 메인으로 자연스럽게 넘어간다.
            .graphicsLayer { alpha = exit.value },
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // 태그라인 — 로고 위(시안). 살짝 아래에서 올라오며 페이드인한다.
        Text(
            text = "물의 내일을 먼저 알리다",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink2,
            modifier = Modifier.graphicsLayer {
                alpha = fadeIn
                translationY = (1f - fadeIn) * 10.dp.toPx()
            },
        )
        Spacer(Modifier.height(18.dp))
        // 로고(시안 에셋) — 물방울 윤곽 + "수신호" 워드마크. 회전 없이 스케일·페이드로만 등장한다.
        Image(
            painter = painterResource(R.drawable.brand_logo),
            // 장식 브랜드 표식 — 의미는 위 태그라인·이후 화면이 전달한다.
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .height(46.dp)
                .clearAndSetSemantics {}
                .graphicsLayer {
                    alpha = fadeIn
                    scaleX = logoScale
                    scaleY = logoScale
                },
        )
    }
}
