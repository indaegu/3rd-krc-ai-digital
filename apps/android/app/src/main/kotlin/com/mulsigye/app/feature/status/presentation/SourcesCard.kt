package com.mulsigye.app.feature.status.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.WatchFg

/**
 * 근거 고지에 쓸 sources를 합친다. status를 앞에 두고 forecast를 뒤에 붙이되 중복은
 * 순서를 보존하며 제거한다(웹 page.tsx mergeSources와 동형). status.sources는 항상 반영된다.
 * 순수 함수로 분리해 단위 테스트한다.
 */
fun mergeSources(
    statusSources: List<String>,
    forecastSources: List<String>,
): List<String> {
    val merged = LinkedHashSet<String>()
    merged.addAll(statusSources)
    merged.addAll(forecastSources)
    return merged.toList()
}

/**
 * 근거·한계 고지 모듈 — "이 화면의 근거".
 *
 * - 공인 단계 기준과 공식 우선 원칙을 **문구로만** 알린다. 임계 상수(70/60/50/40)는
 *   Android 어디에도 두지 않으므로 여기서도 복제하지 않는다(규칙 10).
 * - sources 칩은 status ∪ forecast 병합·중복 제거 결과를 그대로 렌더한다.
 * - **입력은 status/forecast sources·stale뿐이며 coach와 독립**이다. coach가 실패해도
 *   status가 로드되면 이 카드는 그대로 유지된다(웹 SourcesCard 결정과 동일).
 * - stale이면 화면 구조는 그대로 두고 지연 안내 문구만 덧붙인다(구조 불변).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SourcesCard(
    sources: List<String>,
    stale: Boolean,
    modifier: Modifier = Modifier,
) {
    MulsigyeCard(modifier = modifier) {
        Text(
            text = "이 화면의 근거",
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "가뭄 단계는 농어촌공사 공인 기준(지역 평년 대비)을 그대로 써요. " +
                "‘며칠 뒤’ 예측은 참고용이며, 공식 가뭄 예·경보가 항상 우선이에요.",
            style = MaterialTheme.typography.bodyLarge,
            color = Ink2,
        )
        if (stale) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = "일부 공공데이터가 지연되어, 마지막으로 받은 값을 보여주고 있어요.",
                style = MaterialTheme.typography.bodyMedium,
                color = WatchFg,
            )
        }
        if (sources.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                sources.forEach { source ->
                    Text(
                        text = source,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink2,
                        modifier = Modifier
                            .background(Gray100, RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }
}
