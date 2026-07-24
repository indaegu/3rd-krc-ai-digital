package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.stageColorFor
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import com.mulsigye.app.feature.forecast.domain.OfficialOutlook
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

/**
 * 흐름 상세 화면 — 순수 컴포저블(상태 + 뒤로 콜백만).
 *
 * 큰 흐름 차트 + 범례, 가뭄 단계 기준 표, "예측은 이렇게 계산해요"(model 실값 + 공식 우선
 * 고지), 공식 가뭄 전망(officialOutlook null이면 생략). 예측 산식·임계값은 두지 않는다.
 */
@Composable
fun TrendScreen(
    data: ForecastResult.Success,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState()),
    ) {
        // 뒤로 헤더.
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

        Column(
            modifier = Modifier.padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "${data.sigunName} 지역 평년 대비 저수율",
                    style = MaterialTheme.typography.headlineLarge,
                    color = Ink,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = "지난 ${data.history.size}일 실측과 앞으로 ${data.forecast.size}일 예측이에요",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
            }

            // 큰 차트 + 범례.
            MulsigyeCard {
                TrendChart(forecast = data, height = 300.dp)
                Spacer(Modifier.height(12.dp))
                TrendLegend()
            }

            // 가뭄 단계 기준 표.
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
                    text = "현재 예측 오차는 7일 ±${formatMae(data.model.mae7)}%p · 14일 ±${formatMae(data.model.mae14)}%p 수준이에요.",
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

@Composable
private fun OfficialOutlookCard(outlook: OfficialOutlook) {
    MulsigyeCard {
        SectionTitle("공식 가뭄 전망")
        Spacer(Modifier.height(8.dp))
        Text(
            text = "${outlook.publishedOn} 발표 기준이에요. 자체 예측보다 공식 전망이 우선이에요.",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink3,
        )
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlookRow("지금", outlook.current.code, outlook.current.label)
            OutlookRow("1개월 뒤", outlook.outlook1m.code, outlook.outlook1m.label)
            OutlookRow("2개월 뒤", outlook.outlook2m.code, outlook.outlook2m.label)
            OutlookRow("3개월 뒤", outlook.outlook3m.code, outlook.outlook3m.label)
        }
    }
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
