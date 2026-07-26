package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
 * - **주 지표는 지역 평년 대비**(기본 선택)이고, [reservoirHistory]가 있으면 "저수지 실측"으로
 *   토글해 대표 저수지 원저수율 시계열을 볼 수 있다. 두 값은 축·의미가 달라 한 그래프에
 *   겹쳐 그리지 않는다(product.md 두 저수율 분리).
 * - "자세히"는 아이콘+텍스트로 흐름 상세 화면으로 이동하는 콜백을 부른다.
 */
@Composable
fun TrendChartCard(
    forecast: ForecastResult.Success,
    onDetail: () -> Unit,
    reservoirHistory: List<ReservoirRatePoint> = emptyList(),
    reservoirName: String? = null,
    modifier: Modifier = Modifier,
) {
    var showReservoir by rememberSaveable { mutableStateOf(false) }
    val canToggle = reservoirHistory.size >= 2
    val reservoirMode = canToggle && showReservoir
    MulsigyeCard(modifier = modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    // 제목·부제는 선택한 지표를 따라간다(웹 TrendChartCard와 동일).
                    text = if (reservoirMode) "저수지 실제 저수율" else "지역 평년 대비 저수율",
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    // 공표 자료(논가뭄지도)는 연 1회 갱신이라 마지막 실측일이 오늘이 아닐 수 있다.
                    // 어느 날짜 기준인지 부제에 그대로 밝힌다(날짜는 서버 observedOn에서만 온다).
                    text = if (reservoirMode) {
                        "${reservoirName ?: "대표 저수지"} · 최근 ${reservoirHistory.size}일 실측"
                    } else {
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
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MetricToggle(
                    label = "지역 평년 대비",
                    selected = !reservoirMode,
                    onClick = { showReservoir = false },
                )
                MetricToggle(
                    label = "저수지 실측",
                    selected = reservoirMode,
                    onClick = { showReservoir = true },
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
            TrendChart(forecast = forecast, showDates = true)
            Spacer(Modifier.height(12.dp))
            TrendLegend()
        }
    }
}

/** 지표 토글 알약 버튼. 선택된 쪽은 blue-tint 배경 + 파란 글자. */
@Composable
private fun MetricToggle(label: String, selected: Boolean, onClick: () -> Unit) {
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
