package com.mulsigye.app.feature.nearby.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueSoft
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Gray50
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.stageColorFor
import com.mulsigye.app.feature.nearby.domain.NearbyRegion
import com.mulsigye.app.feature.nearby.domain.NearbyResult

/**
 * 공식 가뭄 단계 코드 → 한국어 라벨. 색과 마찬가지로 표시용 매핑만 둔다.
 * 임계값·판정은 서버가 하고 Android는 표시만 한다(AGENTS.md 규칙 5·10).
 */
private fun stageLabelFor(code: String): String = when (code) {
    "ok" -> "정상"
    "watch" -> "관심"
    "care" -> "주의"
    "alert" -> "경계"
    "crit" -> "심각"
    else -> "정보 없음"
}

/** 평년 대비 저수율 표시 — 소수 1자리 반올림, 정수면 소수점 없이(웹 formatRatio와 동일). */
private fun formatRatio(avgRatio: Double): String {
    val rounded = Math.round(avgRatio * 10.0) / 10.0
    return if (rounded % 1.0 == 0.0) rounded.toInt().toString() else rounded.toString()
}

/**
 * 주변 지역 비교 모듈 — 순수 컴포저블(상태만 받음).
 *
 * - 같은 시·도 안에서 우리 지역 물 사정을 이웃과 비교한다(좌표 없어 '주변'=같은 시·도).
 * - 목록은 서버가 확정한 가뭄 심한 순(avgRatio 오름차순) 그대로 그리고, 우리 지역을 강조한다.
 * - 순위 요약은 '넉넉한 순'으로 계산한다(나보다 avgRatio 높은 지역 수 + 1).
 * - 단계 색·라벨은 design-system 토큰과 표시용 매핑만 쓴다(재판정 금지, 규칙 5·10).
 */
@Composable
fun NearbyCompareCard(
    data: NearbyResult.Success,
    modifier: Modifier = Modifier,
) {
    if (data.regions.isEmpty()) {
        return
    }
    val current = data.regions.firstOrNull { it.current }
    // 순위는 '넉넉한 순' — 나보다 avgRatio가 높은 지역 수 + 1.
    val rank = current?.let { c -> data.regions.count { it.avgRatio > c.avgRatio } + 1 }

    MulsigyeCard(modifier = modifier) {
        Text(
            text = "${data.sidoName} 안에서 비교",
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
            modifier = Modifier.semantics { heading() },
        )
        if (rank != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = "${data.sidoName} ${data.regions.size}곳 중 물 사정이 ${rank}번째로 넉넉해요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ink2,
            )
        }
        Spacer(Modifier.height(16.dp))
        data.regions.forEachIndexed { index, region ->
            if (index > 0) {
                Spacer(Modifier.height(8.dp))
            }
            NearbyRow(region)
        }
    }
}

@Composable
private fun NearbyRow(region: NearbyRegion) {
    val colors = stageColorFor(region.stageCode)
    val label = stageLabelFor(region.stageCode)
    val rowModifier = Modifier
        .then(
            if (region.current) {
                Modifier
                    .background(BlueSoft, RoundedCornerShape(12.dp))
                    .border(2.dp, Blue, RoundedCornerShape(12.dp))
            } else {
                Modifier.background(Gray50, RoundedCornerShape(12.dp))
            },
        )
        .padding(horizontal = 10.dp, vertical = 8.dp)

    Row(
        modifier = rowModifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // 단계 색 칩 — 색만으로 구분하지 않도록 단계명을 텍스트로 함께 담는다.
        Text(
            text = label,
            color = colors.fg,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .background(colors.bg, RoundedCornerShape(999.dp))
                .padding(horizontal = 10.dp, vertical = 4.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = region.sigunName,
            style = MaterialTheme.typography.bodyLarge,
            color = Ink,
            fontWeight = FontWeight.SemiBold,
        )
        if (region.current) {
            Spacer(Modifier.width(8.dp))
            Text(
                text = "우리 지역",
                style = MaterialTheme.typography.bodyMedium,
                color = BlueDeep,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .background(Bg, RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
        Spacer(Modifier.weight(1f))
        Text(
            text = "평년 대비 ${formatRatio(region.avgRatio)}%",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink2,
        )
    }
}
