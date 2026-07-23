package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import java.util.Locale

/** MAE %p 표시 — model 메타 실값을 소수 1자리로. 하드코딩·임의 상수 금지(규칙 10). */
private fun formatMae(value: Double): String = String.format(Locale.US, "%.1f", value)

/**
 * '이 추세라면' 도달 예상 모듈 — 다음 공인 단계 도달 예상.
 *
 * - 도달일·대상 단계는 서버가 확정한 reach 값을 그대로 표시한다(재계산 없음, 규칙 10).
 * - 카피는 참고 표현만 쓴다(규칙 3): "지금 추세가 이어지면 N일 뒤 '단계'에 들어설 가능성이 있어요".
 * - MAE 캡션은 model.mae7/mae14 실값을 쓴다(하드코딩 금지).
 */
@Composable
fun ReachCard(
    forecast: ForecastResult.Success,
    modifier: Modifier = Modifier,
) {
    val reach = forecast.reach
    val model = forecast.model
    val days = reach.days
    val targetStage = reach.targetStage

    MulsigyeCard(modifier = modifier) {
        Text(
            text = "이 추세라면",
            style = MaterialTheme.typography.labelMedium,
            color = Ink3,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(8.dp))
        if (days != null && targetStage != null) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = days.toString(),
                    style = MaterialTheme.typography.displayLarge,
                    color = Ink,
                )
                Text(
                    text = "일 뒤",
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink2,
                    modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = "지금 추세가 이어지면 ‘${targetStage.label}’ 단계에 들어설 가능성이 있어요",
                style = MaterialTheme.typography.bodyLarge,
                color = Ink2,
            )
        } else {
            Text(
                text = "안정",
                style = MaterialTheme.typography.headlineLarge,
                color = Ink,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "당분간 물 사정이 안정적으로 유지될 것으로 보여요",
                style = MaterialTheme.typography.bodyLarge,
                color = Ink2,
            )
        }
        Spacer(Modifier.height(12.dp))
        Text(
            text = "예측 오차(백테스트): 7일 ±${formatMae(model.mae7)}%p · 14일 ±${formatMae(model.mae14)}%p 수준이에요",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink3,
        )
    }
}
