package com.mulsigye.app.feature.splash.presentation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOutBack
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.brandGradientBrush
import com.mulsigye.app.core.ui.rememberReducedMotion
import kotlinx.coroutines.delay

private const val SPLASH_MS = 1500L

// 등장 애니메이션 구간(합계 ≤ SPLASH_MS): 물방울이 스케일·페이드로 등장 → 잠깐 머무름 → 부드러운 페이드아웃.
private const val ENTER_MS = 620
private const val HOLD_MS = 520L
private const val EXIT_MS = 340

/**
 * 스플래시 — 메인 최초 진입 시 1.5s 오버레이(로고 등장). 게이팅과 별개로 동의·지역이 모두
 * 있는 메인 위에 잠깐 덮는다.
 *
 * 콜드 재실행에서 돌아오는 사용자에게 보이므로 등장을 기분 좋게 다듬는다: 물방울 로고가 살짝
 * 커지며(가벼운 오버슈트) 페이드인하고, 그 뒤로 잔물결(ripple)이 한 번 퍼진 다음 메인으로
 * 부드럽게 페이드아웃한다. reduced-motion이면 최종 로고를 정적으로 보여주고 모션을 만들지 않으며,
 * 대기 없이 즉시 [onDone]으로 통과시킨다(design-system 접근성). onDone 타이밍/콜백은 유지한다.
 *
 * 외관은 디자인 시안: 전체 브랜드 그라디언트 배경, 로고(물방울 + "수신호") 위에 태그라인.
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

    // enter는 EaseOutBack로 1을 잠깐 넘어설 수 있어(살짝 튀는 느낌) 스케일에 그대로 쓰고, 페이드는 0..1로 제한한다.
    val entrance = enter.value
    val dropScale = 0.72f + 0.28f * entrance
    val fadeIn = entrance.coerceIn(0f, 1f)
    // 잔물결: 등장 진행에 맞춰 한 번 퍼지며 옅어진다.
    val rippleProgress = fadeIn

    Column(
        modifier = modifier
            .fillMaxSize()
            // 전체 브랜드 그라디언트 배경(디자인 시안: 스플래시·온보딩 전체 배경).
            .background(brandGradientBrush())
            // 전체 콘텐츠를 마지막에 부드럽게 페이드아웃해 메인으로 자연스럽게 넘어간다.
            .graphicsLayer { alpha = exit.value },
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // 태그라인 — 로고 위. 브랜드 슬로건(서버값 아님, 고정 카피).
        Text(
            text = "물의 내일을 먼저 알리다",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink2,
            modifier = Modifier.graphicsLayer { alpha = fadeIn },
        )
        Spacer(Modifier.height(20.dp))
        // 로고 — 물방울(애니메이션 유지) + "수신호" 워드마크를 가로로 배치(시안).
        Row(verticalAlignment = Alignment.CenterVertically) {
            Canvas(
                modifier = Modifier
                    .size(44.dp)
                    .clearAndSetSemantics {},
            ) {
                val w = size.width
                val h = size.height

                // 잔물결 링 — 물방울 뒤에서 바깥으로 한 번 퍼지며 옅어진다.
                if (rippleProgress > 0f && rippleProgress < 1f) {
                    val ringRadius = (w * 0.28f) + (w * 0.5f) * rippleProgress
                    drawCircle(
                        color = Blue,
                        radius = ringRadius,
                        alpha = (1f - rippleProgress) * 0.35f,
                        style = Stroke(width = 2.dp.toPx()),
                    )
                }

                // 물방울 — 중심 기준으로 스케일·페이드하며 등장한다(회전 없음).
                scale(scale = dropScale, pivot = center) {
                    val drop = Path().apply {
                        moveTo(w * 0.5f, h * 0.08f)
                        cubicTo(w * 0.9f, h * 0.45f, w * 0.82f, h * 0.9f, w * 0.5f, h * 0.9f)
                        cubicTo(w * 0.18f, h * 0.9f, w * 0.1f, h * 0.45f, w * 0.5f, h * 0.08f)
                        close()
                    }
                    drawPath(path = drop, color = Blue, alpha = fadeIn)
                }
            }
            Spacer(Modifier.width(10.dp))
            Text(
                text = "수신호",
                style = MaterialTheme.typography.displayLarge,
                color = Ink,
                modifier = Modifier.graphicsLayer { alpha = fadeIn },
            )
        }
    }
}
