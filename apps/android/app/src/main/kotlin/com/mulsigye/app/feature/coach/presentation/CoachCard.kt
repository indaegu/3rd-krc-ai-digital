package com.mulsigye.app.feature.coach.presentation

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.coach.domain.CoachContent

/** 화면에 보여줄 행동 최대 개수(product.md: 행동 추천 3개 이하). */
private const val MAX_ACTIONS = 3

/**
 * 물시계 코치 모듈 — 순수 컴포저블(상태 + 콜백만 받음).
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
        // 장식용 물방울 배지 — 접근성 트리에서 제외한다.
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(BlueTint)
                .clearAndSetSemantics {},
        )
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                text = "물시계 코치",
                style = MaterialTheme.typography.titleMedium,
                color = Ink,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = "우리 지역 물 사정을 쉬운 말로",
                style = MaterialTheme.typography.bodyMedium,
                color = Ink3,
            )
        }
    }
}

@Composable
private fun CoachBody(coach: CoachContent) {
    Text(
        text = coach.headline,
        style = MaterialTheme.typography.titleMedium,
        color = Ink,
    )
    Spacer(Modifier.height(8.dp))
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
                    color = Ink3,
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
