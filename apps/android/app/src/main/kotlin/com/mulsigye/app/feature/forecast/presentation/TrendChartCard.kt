package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.forecast.domain.ForecastResult

/**
 * 메인용 '저수율 흐름' 카드 — 제목 + "자세히" → 흐름 상세, 차트, 범례.
 *
 * - 제목·접근성 이름에 "지역 평년 대비 저수율"을 명시한다(design-system).
 * - "자세히"는 아이콘+텍스트로 흐름 상세 화면으로 이동하는 콜백을 부른다.
 */
@Composable
fun TrendChartCard(
    forecast: ForecastResult.Success,
    onDetail: () -> Unit,
    modifier: Modifier = Modifier,
) {
    MulsigyeCard(modifier = modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "지역 평년 대비 저수율 · 지난 ${forecast.history.size}일과 앞으로 ${forecast.forecast.size}일",
                style = MaterialTheme.typography.labelMedium,
                color = Ink3,
                modifier = Modifier
                    .weight(1f)
                    .semantics { heading() },
            )
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
        Spacer(Modifier.height(12.dp))
        TrendChart(forecast = forecast)
        Spacer(Modifier.height(12.dp))
        TrendLegend()
    }
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
