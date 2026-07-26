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
import com.mulsigye.app.core.designsystem.theme.stageColorFor
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
    /** 현재 공인 단계 코드(status). 도달 예정 단계가 없을 때 무엇을 보여줄지 가른다. */
    currentStageCode: String?,
    modifier: Modifier = Modifier,
) {
    val reach = forecast.reach
    val model = forecast.model
    val days = reach.days
    val targetStage = reach.targetStage
    val falling = forecast.trend.bucket == "falling"
    // 이미 가장 낮은 단계(심각)면 '다음 단계'가 없어 reach가 비어 온다. 이때 "안정"이라고 하면
    // 계속 낮아지는 지역을 안심시키는 오해가 생기므로 현재 단계·추세로 문구를 가른다.
    val atWorstStage = currentStageCode == "crit"
    // 큰 글자 색 = 도달 예정 단계 색. 도달 예정이 없으면 현재 단계 색을 쓴다.
    val emphasisColor = stageColorFor(targetStage?.code ?: currentStageCode ?: "ok").text

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
                    color = emphasisColor,
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
            val (headline, detail) = when {
                atWorstStage && falling ->
                    "심각 지속" to "이미 가장 낮은 단계이고, 최근 저수율이 계속 낮아지고 있어요"
                atWorstStage ->
                    "심각 유지" to "이미 가장 낮은 단계예요. 최근 큰 변화는 없어요"
                falling ->
                    "천천히 감소" to "낮아지는 중이지만 30일 안에 다음 단계까지 내려가지는 않을 것으로 보여요"
                else ->
                    "안정" to "당분간 물 사정이 안정적으로 유지될 것으로 보여요"
            }
            Text(
                // 숫자(displayLarge 48sp)와 달리 '안정'·'심각 지속'은 단어라 같은 크기면 과하다.
                text = headline,
                style = MaterialTheme.typography.headlineLarge,
                color = emphasisColor,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = detail,
                style = MaterialTheme.typography.bodyLarge,
                color = Ink2,
            )
        }
        Spacer(Modifier.height(12.dp))
        Text(
            text = "그동안 예측은 실제와 7일 ±${formatMae(model.mae7)}%p · 14일 ±${formatMae(model.mae14)}%p 정도 차이 났어요",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink3,
        )
    }
}
