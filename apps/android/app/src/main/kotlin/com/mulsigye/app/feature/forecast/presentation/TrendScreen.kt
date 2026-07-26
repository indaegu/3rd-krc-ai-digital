package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Canvas
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.component.Shimmer
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Gray50
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.stageColorFor
import com.mulsigye.app.feature.status.domain.StatusResult
import com.mulsigye.app.feature.status.presentation.koreanYearMonthDay
import com.mulsigye.app.feature.forecast.domain.ForecastBandPoint
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import com.mulsigye.app.feature.forecast.domain.OfficialOutlook
import com.mulsigye.app.feature.forecast.domain.StageGuideEntry
import java.util.Locale

/**
 * 가뭄 단계 기준 표 항목 — 단계 label + 한 줄 뜻/행동 카피.
 *
 * **임계 상수(70/60/50/40)를 복제하지 않는다**(규칙 10). 여기 값은 숫자 기준이 아니라
 * 표시용 라벨·행동 카피다. 라벨은 서버 코드와 동일 의미의 공통 표시 문구(product.md SSOT).
 */
private data class StageGuideRow(val code: String, val label: String, val meaning: String)

private val STAGE_GUIDE: List<StageGuideRow> = listOf(
    StageGuideRow("ok", "정상", "평소처럼 관리하면 돼요"),
    StageGuideRow("watch", "관심", "물 사용을 조금씩 아껴요"),
    StageGuideRow("care", "주의", "공동 급수 일정을 확인해요"),
    StageGuideRow("alert", "경계", "제한급수·대체수원을 준비해요"),
    StageGuideRow("crit", "심각", "관계기관 안내에 따라요"),
)

private fun formatMae(value: Double): String = String.format(Locale.US, "%.1f", value)

/** 예측값이 사실상 평평한지(naive 등) — 기우는 예측(linear 등)에는 캡션을 숨긴다. */
internal fun isForecastFlat(points: List<ForecastBandPoint>): Boolean {
    if (points.isEmpty()) return false
    val ratios = points.map { it.avgRatio }
    return (ratios.max() - ratios.min()) < 0.1
}

/**
 * 흐름 상세 화면 — 순수 컴포저블(상태 + 뒤로 콜백만).
 *
 * 큰 흐름 차트 + 범례, 가뭄 단계 기준 표, "예측은 이렇게 계산해요"(model 실값 + 공식 우선
 * 고지), 공식 가뭄 전망(officialOutlook null이면 생략). 예측 산식·임계값은 두지 않는다.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TrendScreen(
    data: ForecastResult.Success,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    /** 대표 저수지 실측 토글 재료. null이면(status 실패·미로딩) 토글을 감춘다. */
    status: StatusResult.Success? = null,
) {
    // 메인 카드에만 있던 토글을 상세에도 둔다 — "자세히"로 들어오면 실측 보기가 사라지던
    // 문제(코드 리뷰 P1)를 없앤다. 두 지표는 축이 달라 겹쳐 그리지 않는다.
    // 0=지역 평년 대비, 1=저수지 실측, 2=함께 보기(메인 카드와 같은 순서).
    var modeIndex by rememberSaveable { mutableStateOf(0) }
    val rates = status?.reservoir?.rateHistory.orEmpty()
    val canToggle = rates.size >= 2
    val reservoirMode = canToggle && modeIndex == 1
    val bothMode = canToggle && modeIndex == 2
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState()),
    ) {
        // 뒤로 헤더.
        TrendTopBar(onBack = onBack)

        Column(
            modifier = Modifier.padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = when {
                        reservoirMode -> "${status?.reservoir?.name ?: "대표 저수지"} 실제 저수율"
                        bothMode -> "${data.sigunName} 지역 평년 대비 + 저수지 실측"
                        else -> "${data.sigunName} 지역 평년 대비 저수율"
                    },
                    style = MaterialTheme.typography.titleLarge,
                    color = Ink,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = when {
                        reservoirMode -> "최근 ${rates.size}일 실측이에요"
                        bothMode ->
                            "예측은 지역 평년 대비 기준이고, " +
                                "${status?.reservoir?.name ?: "대표 저수지"} 실측은 오른쪽 눈금이에요"
                        else -> "지난 ${data.history.size}일 실측과 앞으로 ${data.forecast.size}일 예측이에요"
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
            }

            // 큰 차트 + 범례 + (예측이 평평할 때만) 평평선 설명 캡션.
            MulsigyeCard {
                if (canToggle) {
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
                    Spacer(Modifier.height(12.dp))
                }
                if (reservoirMode) {
                    ReservoirRateChart(
                        history = rates,
                        name = status?.reservoir?.name,
                        height = 300.dp,
                    )
                    Spacer(Modifier.height(12.dp))
                    TrendLegend(observedOnly = true)
                } else {
                    TrendChart(
                        forecast = data,
                        height = 300.dp,
                        showDates = true,
                        reservoirHistory = if (bothMode) rates else emptyList(),
                        reservoirName = status?.reservoir?.name,
                    )
                    Spacer(Modifier.height(12.dp))
                    TrendLegend(withReservoirReference = bothMode)
                    // linear/ma7/ses 등 기우는 예측에는 부적합하므로 실제로 평평할 때만 표시.
                    if (isForecastFlat(data.forecast)) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "예측선이 평평한 건 지금 수준이 이어질 가능성이 가장 높다는 뜻이에요. " +
                                "실제 오르내림은 흐린 띠 범위로 봐요.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Ink3,
                        )
                    }
                }
            }

            // 단계별 행동 가이드 — 서버 stageGuide. 없으면 기존 단계 기준 표로 폴백.
            StageGuideCard(stageGuide = data.stageGuide)

            // 예측 방법 + 공식 우선 고지.
            MulsigyeCard {
                SectionTitle("예측은 이렇게 계산해요")
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "최근 ${data.history.size}일 지역 평년 대비 저수율의 변화 추세로 앞으로 " +
                        "${data.forecast.size}일을 내다봐요. 여러 방법을 과거 데이터로 시험해 오차가 가장 낮은 모델을 골라 써요.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = buildString {
                        append("현재 예측 오차는 7일 ±${formatMae(data.model.mae7)}%p")
                        append(" · 14일 ±${formatMae(data.model.mae14)}%p")
                        // 지평을 30일로 늘렸으므로 그 오차도 함께 밝힌다(서버가 줄 때만).
                        data.model.mae30?.let { append(" · 30일 ±${formatMae(it)}%p") }
                        append(" 수준이에요.")
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "예측은 참고용이며 공식 가뭄 예·경보가 우선이에요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink3,
                    fontWeight = FontWeight.Bold,
                )
            }

            // 공식 가뭄 전망 — 서버 officialOutlook이 있을 때만.
            data.officialOutlook?.let { outlook ->
                OfficialOutlookCard(outlook)
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}

/**
 * 단계별 행동 가이드 — 서버 [StageGuideEntry] 목록(5단계 ok→crit)을 렌더한다.
 * 행동 제목은 서버 카탈로그가 유일 출처이며(카피 복제 금지), 우리 지역 현재 단계를
 * "지금 우리 지역" 표시로 강조한다. stageGuide가 null이면 기존 단계 기준 표로 폴백한다.
 */
@Composable
internal fun StageGuideCard(stageGuide: List<StageGuideEntry>?) {
    if (stageGuide.isNullOrEmpty()) {
        StageGuideFallback()
        return
    }
    MulsigyeCard {
        SectionTitle("단계별 행동 가이드")
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            stageGuide.forEach { entry ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (entry.current) BlueTint else Gray50,
                            RoundedCornerShape(12.dp),
                        )
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StageBadge(code = entry.code, label = entry.label)
                        if (entry.current) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "지금 우리 지역",
                                style = MaterialTheme.typography.bodyMedium,
                                color = BlueDeep,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        entry.actions.forEach { action ->
                            Text(
                                text = "· $action",
                                style = MaterialTheme.typography.bodyLarge,
                                color = Ink2,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** 폴백 표 — 서버 stageGuide가 없을 때만 쓰는 기존 5단계 기준. */
@Composable
private fun StageGuideFallback() {
    MulsigyeCard {
        SectionTitle("가뭄 단계 기준")
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            STAGE_GUIDE.forEach { row ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StageBadge(code = row.code, label = row.label)
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = row.meaning,
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink2,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

/** 흐름 상세 공통 상단바 — 뒤로가기 + 제목. 로딩·오류·본문이 같은 헤더를 쓴다. */
@Composable
private fun TrendTopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .clickable(onClick = onBack)
                .semantics(mergeDescendants = true) { contentDescription = "뒤로" }
                .size(48.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BackArrow()
        }
        Spacer(Modifier.width(4.dp))
        Text(
            text = "지역 평년 대비 흐름",
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
        )
    }
}

/**
 * 흐름 상세 로딩 화면 — 실제 상세 레이아웃(제목·큰 차트·단계 표)을 그대로 흉내 낸 스켈레톤.
 * 밋밋한 "불러오는 중…" 텍스트 대신 모듈별 shimmer로 채워 로딩임을 부드럽게 드러낸다
 * (reduced-motion이면 Shimmer가 정적 회색으로 정지). 장식이라 화면 자체 안내는 최소로 둔다.
 */
@Composable
fun TrendLoadingScreen(onBack: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState()),
    ) {
        TrendTopBar(onBack = onBack)
        Column(
            modifier = Modifier.padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            // 제목 자리.
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Shimmer(modifier = Modifier.fillMaxWidth(0.7f).height(28.dp))
                Shimmer(modifier = Modifier.fillMaxWidth(0.5f).height(16.dp))
            }
            // 큰 차트 카드 자리.
            MulsigyeCard {
                Shimmer(modifier = Modifier.fillMaxWidth().height(300.dp))
                Spacer(Modifier.height(12.dp))
                Shimmer(modifier = Modifier.width(180.dp).height(14.dp))
            }
            // 단계 기준 표 자리.
            MulsigyeCard {
                Shimmer(modifier = Modifier.width(140.dp).height(20.dp))
                Spacer(Modifier.height(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    repeat(3) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Shimmer(modifier = Modifier.width(56.dp).height(28.dp))
                            Spacer(Modifier.width(12.dp))
                            Shimmer(modifier = Modifier.width(180.dp).height(16.dp))
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

/** 흐름 상세 오류 화면 — 뒤로가기 헤더 + 안내 카드(재시도 가능하면 다시 시도 버튼). */
@Composable
fun TrendErrorScreen(
    message: String,
    retryable: Boolean,
    onRetry: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState()),
    ) {
        TrendTopBar(onBack = onBack)
        Column(modifier = Modifier.padding(horizontal = 20.dp)) {
            MulsigyeCard {
                Text(
                    text = "흐름을 불러오지 못했어요",
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(8.dp))
                Text(text = message, style = MaterialTheme.typography.bodyLarge, color = Ink2)
                if (retryable) {
                    Spacer(Modifier.height(16.dp))
                    CtaButton(text = "다시 시도하기", onClick = onRetry)
                }
            }
        }
    }
}

@Composable
private fun OfficialOutlookCard(outlook: OfficialOutlook) {
    MulsigyeCard {
        SectionTitle("공식 가뭄 전망")
        Spacer(Modifier.height(8.dp))
        Text(
            text = "${koreanYearMonthDay(outlook.publishedOn)} 발표분이에요. " +
                "자체 예측보다 공식 전망이 우선이에요.",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink3,
        )
        // 원천이 연 1회 갱신이라 발표가 오래된 경우가 있다. 그걸 숨기면
        // "지금 정상 / 1개월 뒤 정상"이 오늘 판단처럼 읽힌다.
        if (outlook.monthsSincePublished > OUTLOOK_STALE_MONTHS) {
            Spacer(Modifier.height(10.dp))
            Text(
                text = "발표 후 ${outlook.monthsSincePublished}개월이 지나 지금 상황과 다를 수 있어요. " +
                    "최신 예·경보는 농어촌공사 발표를 확인해 주세요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ink2,
                modifier = Modifier
                    .background(Gray100, RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            )
        }
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlookRow("발표 당시", outlook.current.code, outlook.current.label)
            // 라벨은 "1개월 뒤"가 아니라 **서버가 준 대상 월**이다 — 이미 지난 달일 수 있다.
            listOf(outlook.outlook1m, outlook.outlook2m, outlook.outlook3m)
                .forEachIndexed { index, stage ->
                    val label = outlook.targetMonths.getOrNull(index)
                        ?.let(::koreanYearMonth)
                        ?: "${index + 1}개월 뒤"
                    OutlookRow(label, stage.code, stage.label)
                }
        }
    }
}

/** 발표 후 이 개월 수를 넘으면 "지난 전망" 고지를 붙인다(웹 trend 화면과 같은 규칙). */
private const val OUTLOOK_STALE_MONTHS = 2

/** `YYYY-MM` → "2026년 1월". 지난 달인지 바로 알 수 있게 연도까지 쓴다. */
internal fun koreanYearMonth(targetMonth: String): String {
    val year = targetMonth.take(4).toIntOrNull() ?: return targetMonth
    val month = targetMonth.drop(5).take(2).toIntOrNull() ?: return targetMonth
    return "${year}년 ${month}월"
}

@Composable
private fun OutlookRow(period: String, code: String, label: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = period,
            style = MaterialTheme.typography.bodyLarge,
            color = Ink2,
        )
        StageBadge(code = code, label = label)
    }
}

@Composable
private fun StageBadge(code: String, label: String) {
    val colors = stageColorFor(code)
    Text(
        text = label,
        color = colors.fg,
        fontWeight = FontWeight.Bold,
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier
            .background(colors.bg, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        color = Ink,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun BackArrow() {
    Canvas(
        modifier = Modifier
            .size(22.dp)
            .clearAndSetSemantics { },
    ) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w * 0.6f, h * 0.25f)
            lineTo(w * 0.35f, h * 0.5f)
            lineTo(w * 0.6f, h * 0.75f)
        }
        drawPath(path = path, color = Ink, style = Stroke(width = w * 0.11f))
    }
}
