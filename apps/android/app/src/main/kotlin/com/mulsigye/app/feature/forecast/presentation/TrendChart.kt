package com.mulsigye.app.feature.forecast.presentation

import android.graphics.Paint
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueSoft
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.ui.rememberReducedMotion
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
 * - [showDates]=true(상세)면 x축에 날짜 라벨을 그린다(observedOn에서만, 미니는 생략).
 * - 그려-들어오기: 마운트 시 progress 0→1로 선·밴드를 왼→오른 클립으로 드러낸다(밴드는
 *   함께 페이드). OS "애니메이션 삭제"([rememberReducedMotion])면 즉시 최종 상태로 스냅한다.
 * - `contentDescription`에 "지역 평년 대비 저수율 흐름" + 시각 요약을 담아 스크린리더를 돕는다.
 */
@Composable
fun TrendChart(
    forecast: ForecastResult.Success,
    modifier: Modifier = Modifier,
    height: Dp = 220.dp,
    showDates: Boolean = false,
) {
    val description = buildContentDescription(forecast, includeDates = showDates)
    val reducedMotion = rememberReducedMotion()

    // 그려-들어오기 진행도 0→1. reduced-motion이면 즉시 1로 스냅(애니메이션 없음).
    val progress = remember { Animatable(0f) }
    LaunchedEffect(reducedMotion) {
        if (reducedMotion) {
            progress.snapTo(1f)
        } else {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(durationMillis = 820, easing = FastOutSlowInEasing))
        }
    }

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
        val reveal = progress.value.coerceIn(0f, 1f)

        // 오늘 수직 안내선(정적 — 드러내기 클립 밖).
        geo.todayX?.let { tx ->
            drawLine(
                color = Gray100,
                start = Offset(tx, geo.plotTop),
                end = Offset(tx, geo.plotBottom),
                strokeWidth = 1.6.dp.toPx(),
            )
        }

        // 선·밴드는 왼→오른으로 드러낸다(reveal 폭까지만 클립).
        clipRect(left = 0f, top = 0f, right = size.width * reveal, bottom = size.height) {
            // 불확실 밴드(위 high 정방향 + 아래 low 역방향 폴리곤). 밴드는 함께 페이드.
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
                drawPath(path = band, color = BlueSoft, alpha = 0.7f * reveal)
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

        // x축 날짜 라벨(상세 전용, 정적) — observedOn에서만 유도한다.
        if (showDates) {
            drawDateLabels(geo, forecast.history, forecast.forecast)
        }
    }
}

/** 눈금 간격으로 쓸 '보기 좋은' 일수 사다리. 필요한 최소 간격 이상인 첫 값을 쓴다. */
private val NICE_STEP_DAYS = listOf(1, 2, 3, 7, 14, 21, 28, 35, 42, 56)

/**
 * 눈금으로 쓸 인덱스 목록을 고른다 — 순수 함수(테스트 대상).
 *
 * 첫 실측일과 마지막 예측일은 항상 넣고, 그 사이를 일정 간격으로 끊는다.
 * [minGap]은 **라벨이 겹치지 않으려면 몇 칸 이상 떨어져야 하는지**이며, 호출자가 실제 글자
 * 폭에서 계산해 넘긴다. '일' 수로 고정하면 구간이 44일 → 90일로 늘 때 화면 간격이 절반으로
 * 좁아져 날짜가 겹친다(웹 TrendChart와 같은 규칙).
 */
internal fun dateTickIndices(total: Int, todayIndex: Int, minGap: Int): List<Int> {
    if (total <= 0) return emptyList()
    if (total == 1) return listOf(0)
    val last = total - 1
    val gap = kotlin.math.max(1, minGap)
    val step = NICE_STEP_DAYS.firstOrNull { it >= gap } ?: gap

    val ticks = LinkedHashSet<Int>()
    ticks += 0
    var i = step
    while (i < last) {
        val farFromToday = kotlin.math.abs(i - todayIndex) >= gap
        val farFromEnds = i >= gap && last - i >= gap
        if (farFromToday && farFromEnds) ticks += i
        i += step
    }
    ticks += last
    return ticks.sorted()
}

/**
 * x축 날짜 라벨 — 7일 간격 눈금 + '오늘'. 날짜 문자열은 observedOn에서만 온다.
 * 양 끝은 안쪽으로 정렬해 잘리지 않게 하고, 가운데 눈금은 가운데 정렬한다.
 */
private fun DrawScope.drawDateLabels(
    geo: TrendGeometry,
    history: List<ForecastPoint>,
    forecast: List<ForecastBandPoint>,
) {
    val paint = Paint().apply {
        color = Ink3.toArgb()
        textSize = 11.dp.toPx()
        isAntiAlias = true
    }
    val baselineY = size.height - 6.dp.toPx()
    val tickTop = baselineY - 15.dp.toPx()

    // 실측 + 예측을 한 줄로 이어 인덱스를 매긴다(기하 계산과 같은 순서).
    val dates = history.map { it.observedOn } + forecast.map { it.observedOn }
    val total = dates.size
    if (total == 0) return
    val todayIndex = if (history.isEmpty()) -1 else history.size - 1

    fun xAt(index: Int): Float =
        geo.plotLeft + (geo.plotRight - geo.plotLeft) * (index.toFloat() / kotlin.math.max(1, total - 1))

    // 라벨이 실제로 차지하는 폭에서 최소 간격을 뽑는다("12/31" 다섯 자 + 숨 쉴 틈).
    val slotPx = paint.measureText("00/00") + 10.dp.toPx()
    val unitsPerIndex =
        (geo.plotRight - geo.plotLeft) / kotlin.math.max(1, total - 1).toFloat()
    val minGap = kotlin.math.ceil(slotPx / kotlin.math.max(1f, unitsPerIndex)).toInt()

    // 옅은 세로 눈금선 — 날짜 라벨 위치를 그래프와 잇는다(과하지 않게 아주 옅게).
    val tickColor = Color(0x14191F28)
    for (index in dateTickIndices(total, todayIndex, minGap)) {
        val x = xAt(index)
        drawLine(
            color = tickColor,
            start = androidx.compose.ui.geometry.Offset(x, geo.plotTop),
            end = androidx.compose.ui.geometry.Offset(x, tickTop),
            strokeWidth = 1f,
        )
        paint.textAlign = when (index) {
            0 -> Paint.Align.LEFT
            total - 1 -> Paint.Align.RIGHT
            else -> Paint.Align.CENTER
        }
        drawContext.canvas.nativeCanvas.drawText(formatMonthDay(dates[index]), x, baselineY, paint)
    }

    geo.todayX?.let { tx ->
        paint.textAlign = Paint.Align.CENTER
        drawContext.canvas.nativeCanvas.drawText("오늘", tx, baselineY, paint)
    }
}

/** "YYYY-MM-DD" → "M/D"(앞자리 0 제거). 파싱 실패 시 원문 반환. */
internal fun formatMonthDay(observedOn: String): String {
    val parts = observedOn.split("-")
    if (parts.size < 3) return observedOn
    val month = parts[1].toIntOrNull() ?: return observedOn
    val day = parts[2].toIntOrNull() ?: return observedOn
    return "$month/$day"
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
private fun buildContentDescription(
    forecast: ForecastResult.Success,
    includeDates: Boolean = false,
): String {
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
    // 상세 차트는 날짜 축(observedOn)을 함께 읽어준다.
    if (includeDates && first != null && lastFuture != null) {
        parts += "기간은 ${formatMonthDay(first.observedOn)}부터 ${formatMonthDay(lastFuture.observedOn)}까지예요."
    }
    return parts.joinToString(" ")
}

private fun formatRatio(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else (Math.round(value * 10.0) / 10.0).toString()
