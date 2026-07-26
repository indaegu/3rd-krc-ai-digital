package com.mulsigye.app.feature.status.presentation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.stageColorFor
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

/**
 * 올해 흐름 속 현재 위치 카피(서버 확정 yearlyPosition.bucket). 웹 TodayCard와 동일 문구(공통 SSOT).
 * 스냅샷에 없는 지역(yearlyPosition == null)은 렌더하지 않는다.
 */
private val YEARLY_HEADLINE_BY_BUCKET: Map<String, String> = mapOf(
    "low" to "올해 흐름 속 낮은 편이에요",
    "mid" to "올해 흐름 속 보통 수준이에요",
    "high" to "올해 흐름 속 높은 편이에요",
)

/**
 * 보조 세부 문구. low는 하위 N%, high는 상위 100-N%, mid는 중간. 웹 yearlyDetail과 동일 규칙.
 *
 * 양 끝은 따로 말한다 — 백분위 0은 "하위 0%", 100은 "상위 0%"가 되어 뜻이 없어진다
 * (실측: 제주시가 올해 최저값과 같아 "하위 0%"로 보였다).
 */
internal fun yearlyDetail(bucket: String, percentile: Int): String = when {
    percentile <= 0 -> "올해 가장 낮은 수준이에요"
    percentile >= 100 -> "올해 가장 높은 수준이에요"
    bucket == "low" -> "올해 저수율 중 하위 ${kotlin.math.max(1, percentile)}%"
    bucket == "high" -> "올해 저수율 중 상위 ${kotlin.math.max(1, 100 - percentile)}%"
    else -> "올해 저수율 중 중간"
}

// 정수면 소수점 없이, 아니면 소수 1자리로. 기기 로케일과 무관하게 결정적으로 포맷한다.
private fun formatRate(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else (Math.round(value * 10.0) / 10.0).toString()

/**
 * 오늘 우리 저수지 모듈 — 두 저수율을 분리해 보여준다(product.md).
 *
 * - 게이지·큰 숫자 = 지역 평년 대비 avgRatio("평년 대비 …%"). 단계 칩·게이지 눈금과 같은 축이라
 *   함께 정합한다. 게이지 물 색은 현재 단계 색, 눈금은 서버 stageBands.
 * - 원저수율 reservoir.rate는 작은 보조 줄("실제 저수율은 …%예요")로 내려간다.
 * - avgRatio 카운트업 0.6s, reduced-motion이면 즉시 목표값. rate가 null이면 보조 줄에 폴백 문구.
 * - 단계·임계값은 서버 값(code/label/stageBands)을 표시만 하고 계산하지 않는다(규칙 10).
 */
@Composable
fun TodayCard(
    status: StatusResult.Success,
    modifier: Modifier = Modifier,
) {
    val reducedMotion = rememberReducedMotion()
    val rate = status.reservoir.rate
    val avgRatio = status.region.avgRatio

    // 평년 대비(avgRatio) 카운트업(0.6s). reduced-motion이면 즉시 목표값으로 스냅한다.
    val counter = remember { Animatable(0f) }
    LaunchedEffect(avgRatio, reducedMotion) {
        val target = avgRatio.toFloat()
        if (reducedMotion) {
            counter.snapTo(target)
        } else {
            counter.snapTo(0f)
            counter.animateTo(target, tween(durationMillis = COUNT_UP_MS, easing = LinearEasing))
        }
    }
    val avgText =
        if (counter.value >= avgRatio.toFloat()) formatRate(avgRatio) else counter.value.roundToInt().toString()

    val stageColor = stageColorFor(status.region.officialStage.code).fg

    val headline = if (status.highWaterNotice) {
        HIGH_WATER_HEADLINE
    } else {
        HEADLINE_BY_STAGE[status.region.officialStage.code] ?: ""
    }

    MulsigyeCard(modifier = modifier) {
        // 대표 저수지명 탭 라벨(서버값). 시안 §4의 카드 좌측 상단 탭 모양.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = status.reservoir.name,
                style = MaterialTheme.typography.labelMedium,
                color = Ink2,
                modifier = Modifier
                    .semantics { heading() }
                    .background(
                        Gray100,
                        RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp, bottomEnd = 10.dp),
                    )
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            )
            // 공표 자료가 없는 날짜를 실측으로 계산한 값이면 그 사실도, 기준일도 숨기지 않는다.
            // 추정 기준일은 커버리지를 채운 가장 최근 날짜라 오늘이 아닐 수 있다(규칙 5 예외).
            // 공표값이어도 오늘 것이 아니면(연 1회 갱신 자료) 그 기준일을 밝힌다.
            val basisBadge = if (status.region.isEstimate) {
                estimateBadgeLabel(status.region.observedOn, status.asOf)
            } else {
                officialBadgeLabel(status.region.observedOn, status.asOf)
            }
            if (basisBadge != null) {
                Text(
                    text = basisBadge,
                    style = MaterialTheme.typography.labelMedium,
                    color = Ink2,
                    modifier = Modifier
                        .background(Gray100, RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // 시안 §4: 단계는 알약(StageChip) 대신 "평년 대비 {단계}" 인라인 색상 텍스트로 전달한다.
                // 색만으로 구분하지 않도록 단계명을 텍스트로 함께 쓴다(접근성 규칙). 웹 TodayCard와 동일.
                Text(
                    text = buildAnnotatedString {
                        append("평년 대비 ")
                        withStyle(
                            SpanStyle(color = stageColor, fontWeight = FontWeight.Bold),
                        ) {
                            append(status.region.officialStage.label)
                        }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink2,
                )
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        // 큰 값도 현재 공인 단계 색으로 칠한다(게이지 물 색과 같은 축).
                        text = avgText,
                        style = MaterialTheme.typography.displayLarge,
                        fontSize = 52.sp,
                        color = stageColor,
                    )
                    Text(
                        text = "%",
                        style = MaterialTheme.typography.titleLarge,
                        color = Ink2,
                        modifier = Modifier.padding(start = 2.dp, bottom = 6.dp),
                    )
                }
                Text(
                    text = headline,
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                )
                // 원저수율(rate) — 작은 보조 줄. null이면 폴백 문구.
                val secondary = if (rate == null) {
                    AnnotatedString("실제 저수율은 아직 없어요")
                } else {
                    buildAnnotatedString {
                        append("실제 저수율은 ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Ink2)) {
                            append(formatRate(rate))
                        }
                        append("%예요")
                    }
                }
                Text(
                    // 한 줄로 유지한다(줄바꿈되면 숫자와 단위가 갈라져 읽기 어렵다).
                    text = secondary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink3,
                    maxLines = 1,
                    softWrap = false,
                )
                val yearly = status.yearlyPosition
                if (yearly != null) {
                    Text(
                        text = YEARLY_HEADLINE_BY_BUCKET[yearly.bucket] ?: "",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink,
                    )
                    Text(
                        text = yearlyDetail(yearly.bucket, yearly.percentile),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink3,
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            // 우측 비이커 게이지 — 물 색은 단계 색, 단계는 우측 세로 라벨로도 전달한다(시안 §4).
            ReservoirGauge(
                avgRatio = avgRatio,
                stageCode = status.region.officialStage.code,
                stageBands = status.stageBands,
            )
        }
    }
}
