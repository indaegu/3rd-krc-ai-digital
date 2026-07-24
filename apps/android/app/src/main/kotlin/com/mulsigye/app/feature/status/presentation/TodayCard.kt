package com.mulsigye.app.feature.status.presentation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.component.StageChip
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.ui.rememberReducedMotion
import com.mulsigye.app.feature.status.domain.StatusResult
import kotlin.math.roundToInt

private const val COUNT_UP_MS = 600

/**
 * 단계별 검토 완료 헤드라인 상수. 웹 TodayCard의 HEADLINE_BY_STAGE와 동일 문구(공통 SSOT).
 * ~해요체·짧은 문장, 예측을 사실로 단정하는 표현("내려가요/됩니다/위험합니다")은 쓰지 않는다.
 */
private val HEADLINE_BY_STAGE: Map<String, String> = mapOf(
    "ok" to "물 사정이 넉넉해요",
    "watch" to "물이 평소보다 조금 부족해요",
    "care" to "물 부족이 이어지고 있어요",
    "alert" to "물 부족이 빠르게 진행 중이에요",
    "crit" to "물이 많이 부족한 상황이에요",
)

/** 만수위 참고(서버 확정 highWaterNotice)일 때의 헤드라인. 웹과 동일. */
private const val HIGH_WATER_HEADLINE = "비가 많아 물은 충분해요"

// 정수면 소수점 없이, 아니면 소수 1자리로. 기기 로케일과 무관하게 결정적으로 포맷한다.
private fun formatRate(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else (Math.round(value * 10.0) / 10.0).toString()

/**
 * 오늘 우리 저수지 모듈 — 두 저수율을 분리해 보여준다(product.md).
 *
 * - 게이지·큰 숫자 = 대표 저수지 원저수율 reservoir.rate("우리 지역 대표 저수지"/"현재 저수율").
 * - 단계 칩·보조 = 지역 avgRatio("지역 평년 대비 …%").
 * - rate 카운트업 0.6s, reduced-motion이면 즉시 목표값. rate가 null이면 관측 폴백 문구.
 * - 단계는 서버 code/label 표시만 하고 임계값을 계산하지 않는다(규칙 10).
 */
@Composable
fun TodayCard(
    status: StatusResult.Success,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val rate = status.reservoir.rate

    // rate 카운트업(0.6s). reduced-motion이면 즉시 목표값으로 스냅한다.
    val counter = remember { Animatable(0f) }
    LaunchedEffect(rate, reducedMotion) {
        if (rate == null) {
            return@LaunchedEffect
        }
        val target = rate.toFloat()
        if (reducedMotion) {
            counter.snapTo(target)
        } else {
            counter.snapTo(0f)
            counter.animateTo(target, tween(durationMillis = COUNT_UP_MS, easing = LinearEasing))
        }
    }
    val rateText = rate?.let { value ->
        if (counter.value >= value.toFloat()) formatRate(value) else counter.value.roundToInt().toString()
    }

    val headline = if (status.highWaterNotice) {
        HIGH_WATER_HEADLINE
    } else {
        HEADLINE_BY_STAGE[status.region.officialStage.code] ?: ""
    }

    MulsigyeCard(modifier = modifier) {
        Text(
            text = "우리 지역 대표 저수지",
            style = MaterialTheme.typography.labelMedium,
            color = Ink3,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "현재 저수율",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink2,
                )
                if (rate == null) {
                    Text(
                        text = "관측값을 불러오지 못했어요",
                        style = MaterialTheme.typography.titleMedium,
                        color = Ink2,
                    )
                } else {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = rateText ?: "0",
                            style = MaterialTheme.typography.displayLarge,
                            color = Ink,
                        )
                        Text(
                            text = "%",
                            style = MaterialTheme.typography.titleLarge,
                            color = Ink2,
                            modifier = Modifier.padding(start = 2.dp, bottom = 6.dp),
                        )
                    }
                }
                Text(
                    text = buildAnnotatedString {
                        append("지역 평년 대비 ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Ink)) {
                            append("${formatRate(status.region.avgRatio)}%")
                        }
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
                StageChip(
                    label = status.region.officialStage.label,
                    code = status.region.officialStage.code,
                )
                Text(
                    text = headline,
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                )
            }
            Spacer(Modifier.width(16.dp))
            ReservoirGauge(rate = rate)
        }
    }
}
