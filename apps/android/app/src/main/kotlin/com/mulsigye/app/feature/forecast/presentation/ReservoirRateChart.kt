package com.mulsigye.app.feature.forecast.presentation

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.status.domain.ReservoirRatePoint
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

/** y축 위아래 여유(%p) — 선이 테두리에 붙지 않게 한다. */
private const val RANGE_PADDING = 3.0

/**
 * 대표 저수지 실측 저수율 선 그래프 — 예측·밴드 없이 관측만 그린다.
 *
 * 지역 평년 대비(avgRatio)와 축·의미가 다르므로 겹쳐 그리지 않고 토글로만 바꿔 보여준다.
 * 값은 서버 status.reservoir.rateHistory에서만 오고 여기서 만들지 않는다(규칙 10).
 */
@Composable
fun ReservoirRateChart(
    history: List<ReservoirRatePoint>,
    name: String?,
    modifier: Modifier = Modifier,
) {
    if (history.size < 2) return

    val values = history.map { it.rate }
    val lo = max(0.0, floor(values.min() - RANGE_PADDING))
    val hi = ceil(values.max() + RANGE_PADDING)
    val span = if (hi <= lo) 1.0 else hi - lo
    val label = "${name ?: "대표 저수지"} 실제 저수율 흐름: 최근 ${history.size}일 관측"

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(180.dp)
            .semantics { contentDescription = label },
    ) {
        val padLeft = 8.dp.toPx()
        val padRight = 8.dp.toPx()
        val padTop = 10.dp.toPx()
        val padBottom = 26.dp.toPx()
        val plotWidth = size.width - padLeft - padRight
        val plotHeight = size.height - padTop - padBottom

        fun xAt(index: Int): Float =
            padLeft + plotWidth * (index.toFloat() / max(1, history.size - 1))

        fun yAt(value: Double): Float =
            (padTop + plotHeight * (1.0 - (value - lo) / span)).toFloat()

        val path = Path()
        history.forEachIndexed { index, point ->
            val x = xAt(index)
            val y = yAt(point.rate)
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(
            path = path,
            color = Blue,
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round),
        )

        // 마지막 관측점 표시.
        val lastIndex = history.lastIndex
        drawCircle(
            color = Blue,
            radius = 4.dp.toPx(),
            center = Offset(xAt(lastIndex), yAt(history[lastIndex].rate)),
        )

        // 양 끝 날짜 라벨.
        val paint = Paint().apply {
            color = Ink3.toArgb()
            textSize = 11.dp.toPx()
            isAntiAlias = true
        }
        val baselineY = size.height - 6.dp.toPx()
        paint.textAlign = Paint.Align.LEFT
        drawContext.canvas.nativeCanvas.drawText(
            formatMonthDay(history.first().observedOn),
            padLeft,
            baselineY,
            paint,
        )
        paint.textAlign = Paint.Align.RIGHT
        drawContext.canvas.nativeCanvas.drawText(
            formatMonthDay(history.last().observedOn),
            size.width - padRight,
            baselineY,
            paint,
        )
        // 가운데 날짜 하나(구간 감).
        if (history.size >= 5) {
            val mid = history.size / 2
            paint.textAlign = Paint.Align.CENTER
            drawContext.canvas.nativeCanvas.drawText(
                formatMonthDay(history[mid].observedOn),
                xAt(mid),
                baselineY,
                paint,
            )
        }
    }
}
