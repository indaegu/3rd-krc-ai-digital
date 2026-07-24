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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.OkBg
import com.mulsigye.app.core.designsystem.theme.WatchBg

/** 온보딩 한 장. 카피는 웹 onboarding/page.tsx SLIDES와 동일 문구(공통 SSOT). */
private data class OnboardingSlide(val art: Color, val title: String, val body: String)

private val SLIDES: List<OnboardingSlide> = listOf(
    OnboardingSlide(
        art = BlueTint,
        title = "우리 동네 물 사정을 며칠 앞서 알려드려요",
        body = "저수지 데이터로 보는 물관리 코치, 물시계예요.",
    ),
    OnboardingSlide(
        art = OkBg,
        title = "지금 몇 %가 아니라 ‘며칠 뒤’를 알려드려요",
        body = "이 추세가 이어지면 언제 다음 단계인지 미리 계산해요.",
    ),
    OnboardingSlide(
        art = WatchBg,
        title = "오늘 해야 할 물관리, 딱 3가지로 정리해드려요",
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
                    .padding(horizontal = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(140.dp)
                        .background(slide.art, RoundedCornerShape(32.dp)),
                )
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
