package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueSoft
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.feature.forecast.domain.ForecastBandPoint
import com.mulsigye.app.feature.forecast.domain.ForecastPoint
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

// viewBox 안쪽 여백(px). 웹 TrendChart와 동일 규격.
private const val PAD_LEFT = 34f
private const val PAD_RIGHT = 12f
private const val PAD_TOP = 14f
private const val PAD_BOTTOM = 26f

/** 데이터 위아래 시각 여백(%p). 임계 상수가 아니라 순수 여백이다. */
private const val RANGE_PADDING = 5.0

/**
 * 흐름 차트 좌표 계산 결과. 모든 좌표는 API 응답 값에서만 유도된다.
 *
 * - [bandTop]/[bandBottom]은 forecast.high/low에서만 나온다(임의 확장 산식 없음).
 * - [yLo]/[yHi]와 [plotTop]/[plotBottom]을 함께 노출해 단위 테스트가 밴드 y를 재검증할 수 있게 한다.
 */
data class TrendGeometry(
    val yLo: Double,
    val yHi: Double,
    val history: List<Offset>,
    /** 예측 실선 경로 — 마지막 실측점을 앵커로 이어붙인다. */
    val forecast: List<Offset>,
    /** 불확실 밴드 위 가장자리(forecast.high). */
    val bandTop: List<Offset>,
    /** 불확실 밴드 아래 가장자리(forecast.low, 정방향). 폴리곤은 이를 역순으로 잇는다. */
    val bandBottom: List<Offset>,
    val todayX: Float?,
    /** 오늘 기준점 마커(basis.avgRatio). */
    val marker: Offset?,
    val plotTop: Float,
    val plotBottom: Float,
    val plotLeft: Float,
    val plotRight: Float,
)

/**
 * 실측·예측·밴드 좌표를 계산하는 순수 함수. Canvas는 이 결과만 그린다.
 *
 * y 범위는 실측 avgRatio + 예측 avgRatio·low·high 전체에서만 잡고, 가뭄 임계 상수는
 * 쓰지 않는다(규칙 10 — Android에 임계값 없음). 값이 모두 같아 hi==lo가 돼도 0으로
 * 나누지 않도록 방어한다(NaN 없음). 빈 history도 안전하게 처리한다.
 */
fun computeTrendGeometry(
    history: List<ForecastPoint>,
    forecast: List<ForecastBandPoint>,
    basisAvgRatio: Double,
    width: Float,
    height: Float,
): TrendGeometry {
    val values = ArrayList<Double>(history.size + forecast.size * 3)
    for (point in history) values += point.avgRatio
    for (point in forecast) {
        values += point.avgRatio
        values += point.low
        values += point.high
    }
    var lo = if (values.isEmpty()) 0.0 else values.min()
    var hi = if (values.isEmpty()) 100.0 else values.max()
    lo = max(0.0, floor(lo - RANGE_PADDING))
    hi = ceil(hi + RANGE_PADDING)
    if (hi <= lo) hi = lo + 1.0

    val plotLeft = PAD_LEFT
    val plotRight = width - PAD_RIGHT
    val plotTop = PAD_TOP
    val plotBottom = height - PAD_BOTTOM
    val total = history.size + forecast.size

    fun xAt(index: Int): Float =
        plotLeft + (plotRight - plotLeft) * (index.toFloat() / max(1, total - 1))

    fun yAt(value: Double): Float =
        (plotTop + (plotBottom - plotTop) * (1.0 - (value - lo) / (hi - lo))).toFloat()

    val historyPts = history.mapIndexed { i, p -> Offset(xAt(i), yAt(p.avgRatio)) }

    val forecastPts = ArrayList<Offset>(forecast.size + 1)
    if (forecast.isNotEmpty()) {
        val lastHistory = history.lastOrNull()
        if (lastHistory != null) {
            forecastPts += Offset(xAt(history.size - 1), yAt(lastHistory.avgRatio))
        }
        forecast.forEachIndexed { j, p -> forecastPts += Offset(xAt(history.size + j), yAt(p.avgRatio)) }
    }

    val bandTop = forecast.mapIndexed { j, p -> Offset(xAt(history.size + j), yAt(p.high)) }
    val bandBottom = forecast.mapIndexed { j, p -> Offset(xAt(history.size + j), yAt(p.low)) }

    val todayX = if (history.isNotEmpty()) xAt(history.size - 1) else null
    val marker = if (history.isNotEmpty()) Offset(xAt(history.size - 1), yAt(basisAvgRatio)) else null

    return TrendGeometry(
        yLo = lo,
        yHi = hi,
        history = historyPts,
        forecast = forecastPts,
        bandTop = bandTop,
        bandBottom = bandBottom,
        todayX = todayX,
        marker = marker,
        plotTop = plotTop,
        plotBottom = plotBottom,
        plotLeft = plotLeft,
        plotRight = plotRight,
    )
}

/**
 * 평년 대비 저수율 흐름 Canvas 차트 — 순수 프리젠테이션.
 *
 * - 실측=파랑 실선, 예측=진파랑 점선, 불확실 밴드=옅은 파랑 폴리곤(forecast.low/high만).
 * - '오늘' 수직선 + 기준점 마커(basis.avgRatio). y축 라벨·임계선은 표시 규격상 생략한다
 *   (가뭄 임계 상수를 Android에 두지 않기 위함).
 * - `contentDescription`에 "지역 평년 대비 저수율 흐름" + 시각 요약을 담아 스크린리더를 돕는다.
 */
@Composable
fun TrendChart(
    forecast: ForecastResult.Success,
    modifier: Modifier = Modifier,
    height: Dp = 220.dp,
) {
    val description = buildContentDescription(forecast)
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .semantics { contentDescription = description },
    ) {
        val geo = computeTrendGeometry(
            history = forecast.history,
            forecast = forecast.forecast,
            basisAvgRatio = forecast.basis.avgRatio,
            width = size.width,
            height = size.height,
        )

        // 불확실 밴드(위 high 정방향 + 아래 low 역방향 폴리곤).
        if (geo.bandTop.isNotEmpty()) {
            val band = Path()
            geo.bandTop.forEachIndexed { i, o ->
                if (i == 0) band.moveTo(o.x, o.y) else band.lineTo(o.x, o.y)
            }
            for (i in geo.bandBottom.indices.reversed()) {
                val o = geo.bandBottom[i]
                band.lineTo(o.x, o.y)
            }
            band.close()
            drawPath(path = band, color = BlueSoft, alpha = 0.7f)
        }

        // 오늘 수직 안내선(밴드·선 아래).
        geo.todayX?.let { tx ->
            drawLine(
                color = Gray100,
                start = Offset(tx, geo.plotTop),
                end = Offset(tx, geo.plotBottom),
                strokeWidth = 1.6.dp.toPx(),
            )
        }

        // 실측 실선.
        drawPolyline(geo.history, Blue, 2.8.dp.toPx())

        // 예측 점선.
        drawPolyline(
            geo.forecast,
            BlueDeep,
            2.3.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 6.dp.toPx())),
        )

        // 오늘 기준점 마커(basis.avgRatio) — 흰 테두리.
        geo.marker?.let { m ->
            drawCircle(color = Bg, radius = 6.4.dp.toPx(), center = m)
            drawCircle(color = BlueDeep, radius = 4.6.dp.toPx(), center = m)
        }
    }
}

private fun DrawScope.drawPolyline(
    points: List<Offset>,
    color: Color,
    strokeWidth: Float,
    pathEffect: PathEffect? = null,
) {
    if (points.size < 2) {
        return
    }
    val path = Path()
    points.forEachIndexed { i, o ->
        if (i == 0) path.moveTo(o.x, o.y) else path.lineTo(o.x, o.y)
    }
    drawPath(
        path = path,
        color = color,
        style = Stroke(width = strokeWidth, cap = StrokeCap.Round, pathEffect = pathEffect),
    )
}

/** 예측 단정 표현을 피하고 "보여요"만 쓰는 시각 요약(규칙 3). */
private fun buildContentDescription(forecast: ForecastResult.Success): String {
    val history = forecast.history
    val future = forecast.forecast
    val parts = ArrayList<String>()
    parts += "지역 평년 대비 저수율 흐름 그래프예요."
    val first = history.firstOrNull()
    val last = history.lastOrNull()
    if (first != null && last != null) {
        parts += "지난 ${history.size}일 실측은 ${formatRatio(first.avgRatio)}%에서 ${formatRatio(last.avgRatio)}%였어요."
    }
    val lastFuture = future.lastOrNull()
    if (lastFuture != null) {
        parts += "앞으로 ${future.size}일은 ${formatRatio(lastFuture.low)}%에서 ${formatRatio(lastFuture.high)}% 사이로 보여요."
    }
    return parts.joinToString(" ")
}

private fun formatRatio(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else (Math.round(value * 10.0) / 10.0).toString()
