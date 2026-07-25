package com.mulsigye.app.feature.onboarding.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.ui.rememberReducedMotion
import kotlin.math.absoluteValue
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.OkBg
import com.mulsigye.app.core.designsystem.theme.WatchBg

/**
 * 온보딩 한 장. 카피는 웹 onboarding/page.tsx SLIDES와 동일 문구(공통 SSOT)이며,
 * 제목의 줄바꿈(\n)은 표시용으로 자연스러운 지점에 넣는다(문구 자체는 바꾸지 않는다).
 * [emoji]는 아직 삽화 에셋이 없어 큰 이모지로 대체한다(고령 사용자 가독성).
 */
private data class OnboardingSlide(
    val art: Color,
    val emoji: String,
    val title: String,
    val body: String,
)

private val SLIDES: List<OnboardingSlide> = listOf(
    OnboardingSlide(
        art = BlueTint,
        emoji = "💧",
        title = "우리 동네 물 사정을\n며칠 앞서 알려드려요",
        body = "저수지 데이터로 보는 물관리 코치, 수신호예요.",
    ),
    OnboardingSlide(
        art = OkBg,
        emoji = "📅",
        title = "지금 물 사정에\n며칠 뒤 흐름까지 알려드려요",
        body = "이 추세가 이어지면 언제 다음 단계인지 미리 계산해요.",
    ),
    OnboardingSlide(
        art = WatchBg,
        emoji = "✅",
        title = "오늘 해야 할 물관리,\n딱 3가지로 정리해드려요",
        body = "어려운 그래프 대신, 지금 할 일부터 짚어드려요.",
    ),
)

/**
 * 온보딩 — 최초 사용자만 보는 3장 캐러셀(HorizontalPager + 점 표시). 순수 컴포저블.
 *
 * CTA "내 지역 설정하기" → [onDone](라우터가 지역 설정으로 이동, 그곳에서 동의 시트가 열린다).
 * 로그인·회원가입이 없음을 "가입 없이 바로 시작해요"로 안내한다.
 */
@Composable
fun OnboardingScreen(
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val pagerState = rememberPagerState(pageCount = { SLIDES.size })
    // OS "애니메이션 삭제"면 슬라이드 페이드/스케일 없이 정적으로 둔다(reduced-motion).
    val reducedMotion = rememberReducedMotion()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        ) { page ->
            val slide = SLIDES[page]
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    // 스와이프하는 동안 정착 위치에서 멀어질수록 슬라이드를 부드럽게 페이드·축소해
                    // 좌우 전환의 하드 컷을 없앤다. reduced-motion이면 이 효과를 건너뛰고 정적으로 둔다.
                    .then(
                        if (reducedMotion) {
                            Modifier
                        } else {
                            Modifier.graphicsLayer {
                                val distance = (
                                    (pagerState.currentPage - page) +
                                        pagerState.currentPageOffsetFraction
                                    ).absoluteValue.coerceIn(0f, 1f)
                                alpha = 1f - 0.7f * distance
                                val scale = 1f - 0.06f * distance
                                scaleX = scale
                                scaleY = scale
                            }
                        },
                    )
                    .padding(horizontal = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(140.dp)
                        .background(slide.art, RoundedCornerShape(32.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = slide.emoji,
                        fontSize = 64.sp,
                        // 장식 삽화 — 접근성 트리에서 제외(제목·본문이 의미를 전달).
                        modifier = Modifier.clearAndSetSemantics {},
                    )
                }
                Spacer(Modifier.height(32.dp))
                Text(
                    text = slide.title,
                    style = MaterialTheme.typography.headlineLarge,
                    color = Ink,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = slide.body,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SLIDES.indices.forEach { index ->
                Box(
                    modifier = Modifier
                        .size(if (index == pagerState.currentPage) 10.dp else 8.dp)
                        .background(
                            color = if (index == pagerState.currentPage) Blue else Gray200,
                            shape = CircleShape,
                        ),
                )
            }
        }

        Spacer(Modifier.height(24.dp))
        CtaButton(text = "내 지역 설정하기", onClick = onDone)
        Spacer(Modifier.height(12.dp))
        Text(
            text = "가입 없이 바로 시작해요",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink3,
        )
    }
}
