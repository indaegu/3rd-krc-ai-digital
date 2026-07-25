package com.mulsigye.app.feature.coach.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.R
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.coach.domain.CoachContent

/** 화면에 보여줄 행동 최대 개수(product.md: 행동 추천 3개 이하). */
private const val MAX_ACTIONS = 3

/**
 * 수신호 코치 모듈 — 순수 컴포저블(상태 + 콜백만 받음).
 *
 * - 서버가 확정한 headline·summary·행동(최대 3개)을 그대로 표시한다(규칙 10).
 * - mode(llm/cache/static)·fallbackReason은 **읽지 않는다** → 어떤 mode에서도 렌더 구조가 동일하다.
 * - coach 오류 시 이 모듈만 오류 카드로 대체하며 다른 모듈에는 영향을 주지 않는다(비차단·격리).
 * - 자유 채팅/자유 입력 UI는 절대 넣지 않는다(spec 15절 — 통제형 동적 설명).
 */
@Composable
fun CoachCard(
    state: CoachUiState,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    MulsigyeCard(modifier = modifier) {
        CoachHeader()
        Spacer(Modifier.height(16.dp))
        when (state) {
            is CoachUiState.Loading -> {
                Text(
                    text = "코치가 설명을 준비하고 있어요…",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink3,
                )
            }

            is CoachUiState.Error -> {
                // 코치 모듈만 오류 카드로 대체한다. 채팅/입력 암시 UI는 두지 않는다.
                Text(
                    text = state.message,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
                if (state.retryable) {
                    Spacer(Modifier.height(16.dp))
                    CtaButton(text = "다시 시도하기", onClick = onRetry)
                }
            }

            is CoachUiState.Ready -> CoachBody(state.data.coach)
        }
    }
}

@Composable
private fun CoachHeader() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        // 코치 원형 아바타 — 마스코트 에셋은 배경이 투명하므로 원형 배경(BlueTint)을 깔고
        // 안쪽에 Fit으로 넣어 팔·다리가 잘리지 않게 한다(시안 §7, 51dp 원).
        Box(
            modifier = Modifier
                .size(51.dp)
                .clip(CircleShape)
                .background(BlueTint)
                .clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.coach_avatar),
                // 장식 이미지 — 이름은 옆 제목("수신호 코치")이 소유한다.
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(42.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                text = "수신호 코치",
                style = MaterialTheme.typography.titleMedium,
                color = Ink,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = "우리 지역 수신호를 쉽게 알려드려요",
                style = MaterialTheme.typography.bodyMedium,
                color = Ink3,
            )
        }
    }
}

@Composable
private fun CoachBody(coach: CoachContent) {
    // 코치 헤드라인 = 파란 말풍선(꼬리 포함) 한 줄. 서버값 그대로.
    SpeechBubble(text = coach.headline)
    Spacer(Modifier.height(12.dp))
    Text(
        text = coach.summary,
        style = MaterialTheme.typography.bodyLarge,
        color = Ink2,
    )
    Spacer(Modifier.height(16.dp))
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        coach.actions.take(MAX_ACTIONS).forEachIndexed { index, action ->
            Row {
                Text(
                    text = "${index + 1}",
                    style = MaterialTheme.typography.labelLarge,
                    color = Blue,
                    modifier = Modifier.width(24.dp),
                )
                Column {
                    Text(
                        text = action.title,
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = action.reason,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink2,
                    )
                }
            }
        }
    }
}

/** 파란 말풍선(위쪽 꼬리) — 코치 한 줄 인사/요약. 텍스트는 서버값을 그대로 받는다. */
@Composable
private fun SpeechBubble(text: String) {
    Column {
        Canvas(
            modifier = Modifier
                .padding(start = 18.dp)
                .size(width = 16.dp, height = 8.dp)
                .clearAndSetSemantics {},
        ) {
            val w = size.width
            val h = size.height
            val tail = Path().apply {
                moveTo(0f, h)
                lineTo(w * 0.5f, 0f)
                lineTo(w, h)
                close()
            }
            drawPath(path = tail, color = Blue)
        }
        Box(
            modifier = Modifier
                .background(Blue, RoundedCornerShape(20.dp))
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyLarge,
                color = Bg,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
