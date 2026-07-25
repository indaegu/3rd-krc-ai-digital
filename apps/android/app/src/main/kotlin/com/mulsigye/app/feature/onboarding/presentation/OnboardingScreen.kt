package com.mulsigye.app.feature.onboarding.presentation

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.mulsigye.app.R
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.Ink4
import com.mulsigye.app.core.designsystem.theme.brandGradientBrush

/**
 * 온보딩 한 장. 카피는 웹 onboarding/page.tsx SLIDES와 동일 문구(공통 SSOT, 디자인 시안 §2 확정)이며,
 * 제목의 줄바꿈(\n)은 표시용으로 자연스러운 지점에 넣는다(문구 자체는 바꾸지 않는다).
 * [art]는 장별 삽화 PNG(onboarding_1..3).
 */
private data class OnboardingSlide(
    @DrawableRes val art: Int,
    val title: String,
    val body: String,
)

/** 페이저 좌우 끝 페이드 폭. 이 폭만큼 양 끝이 투명으로 사라져 슬라이드 경계가 부드럽게 이어진다. */
private val EdgeFadeWidth = 28.dp

/** 삽화 최대 높이(시안 기준 ≈230dp). 화면이 좁으면 이보다 작게 줄어든다. */
private val ArtHeight = 230.dp

private val SLIDES: List<OnboardingSlide> = listOf(
    OnboardingSlide(
        art = R.drawable.onboarding_1,
        title = "우리 동네 물 사정을\n며칠 앞서 알려드려요",
        body = "저수지 데이터로 보는 물관리 코치, 수신호예요.",
    ),
    OnboardingSlide(
        art = R.drawable.onboarding_2,
        title = "지금 몇 %가 아니라\n'며칠 뒤'를 알려드려요",
        body = "이 추세가 이어지면 언제 다음 단계인지 미리 계산해요.",
    ),
    OnboardingSlide(
        art = R.drawable.onboarding_3,
        title = "오늘 해야 할 물관리,\n딱 3가지로 정리해 드려요.",
        body = "어려운 그래프 대신, 지금 할 일부터 짚어드려요.",
    ),
)

/**
 * 페이저 좌우 끝 가장자리만 부드럽게 페이드(feather)한다 — 슬라이드 전체를 흐리게 하지 않고
 * 양 끝 [fadeWidth]폭만 투명으로 가는 가로 그라디언트를 DstIn으로 곱해, 스와이프할 때
 * 인접 슬라이드가 딱딱 끊기지 않고 자연스럽게 녹아들어 보이게 한다(중앙은 또렷).
 */
private fun Modifier.edgeFade(fadeWidth: Dp): Modifier = this
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        val frac = (fadeWidth.toPx() / size.width).coerceIn(0f, 0.5f)
        drawRect(
            brush = Brush.horizontalGradient(
                0f to Color.Transparent,
                frac to Color.Black,
                1f - frac to Color.Black,
                1f to Color.Transparent,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

/** 스플래시와 동일한 상단 헤더 — 태그라인 + 로고(brand_logo). 각 장 공통으로 위에 고정된다. */
@Composable
private fun OnboardingHeader() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "물의 내일을 먼저 알리다",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink2,
        )
        Spacer(Modifier.height(12.dp))
        Image(
            painter = painterResource(R.drawable.brand_logo),
            // 장식 로고 — 워드마크 의미는 헤더 텍스트가 아니라 브랜드 표식이라 트리에서 제외한다.
            contentDescription = null,
            modifier = Modifier
                .height(34.dp)
                .clearAndSetSemantics {},
        )
    }
}

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

    Column(
        modifier = modifier
            .fillMaxSize()
            // 전체 브랜드 그라디언트 배경(디자인 시안: 스플래시·온보딩 전체 배경).
            .background(brandGradientBrush())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(8.dp))
        OnboardingHeader()

        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                // 좌우 끝만 부드럽게 페이드해 슬라이드 경계가 딱 끊기지 않게 한다(전체 블러 아님).
                .edgeFade(EdgeFadeWidth),
        ) { page ->
            val slide = SLIDES[page]
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    // 좌우 패딩은 EdgeFadeWidth(28dp)보다 크게 — 제목·본문이 페이드에 물려
                    // 흐릿하게 잘리지 않게 한다.
                    .padding(horizontal = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Image(
                    painter = painterResource(slide.art),
                    // 장식 삽화 — 접근성 트리에서 제외(제목·본문이 의미를 전달).
                    contentDescription = null,
                    // 시안 크기(약 화면 폭의 45%)로 크게 보여준다. 에셋 원본 픽셀 크기에 좌우되지 않도록
                    // 폭·높이를 모두 지정하고 Fit으로 비율을 유지한다(가운데 정렬).
                    contentScale = ContentScale.Fit,
                    // 남는 높이에 맞춰 줄어들되(작은 화면에서 제목이 밀려나지 않게) 시안 크기를 넘지 않는다.
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false)
                        .heightIn(max = ArtHeight)
                        .clearAndSetSemantics {},
                )
                Spacer(Modifier.height(28.dp))
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
        // 페이지 표시 점 — 그라디언트 배경 위에서도 보이도록 미선택 점을 Ink4(회청색)로 둔다
        // (Gray200은 배경과 명도가 비슷해 보이지 않았다). 현재 점은 파랑 + 가로로 길게.
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SLIDES.indices.forEach { index ->
                val current = index == pagerState.currentPage
                Box(
                    modifier = Modifier
                        .height(8.dp)
                        .width(if (current) 22.dp else 8.dp)
                        .background(
                            color = if (current) Blue else Ink4,
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
