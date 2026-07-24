package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueSoft
import com.mulsigye.app.core.designsystem.theme.Ink2

/**
 * 차트 범례 — 실측(실선)·예측(점선)·불확실 구간(밴드). 색만으로 구분하지 않도록
 * 각 항목에 이름 텍스트를 함께 둔다. 표식 캔버스는 장식이라 접근성 트리에서 제외한다.
 */
@Composable
fun TrendLegend(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LegendItem("실측") { SolidSwatch(Blue) }
        LegendItem("예측") { DashSwatch(BlueDeep) }
        LegendItem("불확실 구간") { BandSwatch(BlueSoft) }
    }
}

@Composable
private fun LegendItem(label: String, swatch: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        swatch()
        Spacer(Modifier.width(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = Ink2,
        )
    }
}

@Composable
private fun SolidSwatch(color: Color) {
    Canvas(modifier = Modifier.size(width = 20.dp, height = 12.dp).clearAndSetSemantics { }) {
        val cy = size.height / 2f
        drawLine(color, Offset(0f, cy), Offset(size.width, cy), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
    }
}

@Composable
private fun DashSwatch(color: Color) {
    Canvas(modifier = Modifier.size(width = 20.dp, height = 12.dp).clearAndSetSemantics { }) {
        val cy = size.height / 2f
        drawLine(
            color,
            Offset(0f, cy),
            Offset(size.width, cy),
            strokeWidth = 3.dp.toPx(),
            cap = StrokeCap.Round,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx())),
        )
    }
}

@Composable
private fun BandSwatch(color: Color) {
    Canvas(modifier = Modifier.size(width = 20.dp, height = 12.dp).clearAndSetSemantics { }) {
        drawRoundRect(color = color, alpha = 0.7f)
    }
}
