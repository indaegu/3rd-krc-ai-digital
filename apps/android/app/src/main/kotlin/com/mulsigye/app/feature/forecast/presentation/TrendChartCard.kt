package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink3
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.feature.status.domain.ReservoirRatePoint
import com.mulsigye.app.feature.forecast.domain.ForecastResult

/**
 * 메인용 '저수율 흐름' 카드 — 제목 + "자세히" → 흐름 상세, 차트, 범례.
 *
 * - 제목·접근성 이름에 "지역 평년 대비 저수율"을 명시한다(design-system).
 * - 지표 토글 3종(product.md): **① 지역 평년 대비 예측**(기본) · ② 저수지 실측 ·
 *   ③ 함께 보기. ③은 ①의 예측선·밴드를 그대로 두고 저수지 실측을 **오른쪽 축**에 참고선으로
 *   얹는다 — 두 값은 축·의미가 달라 같은 축에 겹치지 않는다. 새 예측 모델은 만들지 않는다.
 * - "자세히"는 아이콘+텍스트로 흐름 상세 화면으로 이동하는 콜백을 부른다.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TrendChartCard(
    forecast: ForecastResult.Success,
    onDetail: () -> Unit,
    reservoirHistory: List<ReservoirRatePoint> = emptyList(),
    reservoirName: String? = null,
    modifier: Modifier = Modifier,
) {
    // 0=지역 평년 대비, 1=저수지 실측, 2=함께 보기. 문자열 대신 인덱스로 저장해 복원이 단순하다.
    var modeIndex by rememberSaveable { mutableStateOf(0) }
    val canToggle = reservoirHistory.size >= 2
    val reservoirMode = canToggle && modeIndex == 1
    val bothMode = canToggle && modeIndex == 2
    MulsigyeCard(modifier = modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    // 제목·부제는 선택한 지표를 따라간다(웹 TrendChartCard와 동일).
                    text = when {
                        reservoirMode -> "저수지 실제 저수율"
                        bothMode -> "지역 평년 대비 + 저수지 실측"
                        else -> "지역 평년 대비 저수율"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    // 공표 자료(논가뭄지도)는 연 1회 갱신이라 마지막 실측일이 오늘이 아닐 수 있다.
                    // 어느 날짜 기준인지 부제에 그대로 밝힌다(날짜는 서버 observedOn에서만 온다).
                    text = when {
                        reservoirMode ->
                            "${reservoirName ?: "대표 저수지"} · 최근 ${reservoirHistory.size}일 실측"
                        bothMode ->
                            "예측은 지역 평년 대비 기준 · ${reservoirName ?: "대표 저수지"} 실측은 오른쪽 눈금"
                        else ->
                            forecast.history.lastOrNull()?.observedOn
                                ?.let { "$it 기준 · 지난 ${forecast.history.size}일과 앞으로 ${forecast.forecast.size}일" }
                                ?: "지난 ${forecast.history.size}일과 앞으로 ${forecast.forecast.size}일"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = Ink3,
                )
            }
            Spacer(Modifier.width(8.dp))
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onDetail)
                    .semantics(mergeDescendants = true) { contentDescription = "흐름 자세히 보기" }
                    .sizeIn(minHeight = 48.dp)
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "자세히",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Blue,
                )
                Spacer(Modifier.width(2.dp))
                Chevron()
            }
        }
        if (canToggle) {
            Spacer(Modifier.height(10.dp))
            // 토글이 셋이라 큰 글꼴에서는 한 줄을 넘는다 — 줄바꿈되게 FlowRow를 쓴다.
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                MetricToggle(
                    label = "지역 평년 대비",
                    selected = modeIndex == 0,
                    onClick = { modeIndex = 0 },
                )
                MetricToggle(
                    label = "저수지 실측",
                    selected = reservoirMode,
                    onClick = { modeIndex = 1 },
                )
                MetricToggle(
                    label = "함께 보기",
                    selected = bothMode,
                    onClick = { modeIndex = 2 },
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        if (reservoirMode) {
            ReservoirRateChart(history = reservoirHistory, name = reservoirName)
            Spacer(Modifier.height(12.dp))
            TrendLegend(observedOnly = true)
        } else {
            // 미니 차트에도 x축 날짜(첫 날짜·오늘·마지막 날짜)를 보여준다(#11 — 상세와 동일 showDates 경로).
            TrendChart(
                forecast = forecast,
                showDates = true,
                reservoirHistory = if (bothMode) reservoirHistory else emptyList(),
                reservoirName = reservoirName,
            )
            Spacer(Modifier.height(12.dp))
            TrendLegend(withReservoirReference = bothMode)
        }
    }
}

/** 지표 토글 알약 버튼. 선택된 쪽은 blue-tint 배경 + 파란 글자. 상세 화면도 이 버튼을 쓴다. */
@Composable
internal fun MetricToggle(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) BlueDeep else Ink3,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) BlueTint else Gray100)
            .clickable(onClick = onClick)
            .semantics { contentDescription = if (selected) "$label 선택됨" else label }
            .sizeIn(minHeight = 40.dp)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    )
}

@Composable
private fun Chevron() {
    Canvas(
        modifier = Modifier
            .size(16.dp)
            .clearAndSetSemantics { },
    ) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w * 0.35f, h * 0.25f)
            lineTo(w * 0.65f, h * 0.5f)
            lineTo(w * 0.35f, h * 0.75f)
        }
        drawPath(path = path, color = Blue, style = Stroke(width = w * 0.12f))
    }
}
