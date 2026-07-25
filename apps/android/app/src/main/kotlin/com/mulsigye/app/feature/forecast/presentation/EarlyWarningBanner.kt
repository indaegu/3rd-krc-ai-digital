package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.WatchBg
import com.mulsigye.app.core.designsystem.theme.WatchFg
import com.mulsigye.app.feature.forecast.domain.ForecastEarlyWarning

/**
 * '감소 주의' 조기경보 배너 — 서버가 확정한 earlyWarning이 있을 때만 표시한다.
 *
 * - 공식 가뭄 단계 칩과 **별개인 앱 자체 참고 신호**다(공식 70/60/50/40 기준이 아님).
 * - 위험 체계(단계 칩)와 혼동되지 않게 watch 톤(WatchFg/WatchBg)으로 분리한다.
 * - 문구는 서버 message를 그대로 쓴다. earlyWarning이 null이면 아무것도 그리지 않는다.
 */
@Composable
fun EarlyWarningBanner(
    earlyWarning: ForecastEarlyWarning?,
    modifier: Modifier = Modifier,
) {
    if (earlyWarning == null) return
    Text(
        text = "참고 조기경보 · ${earlyWarning.message}",
        style = MaterialTheme.typography.bodyMedium,
        color = WatchFg,
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(WatchBg)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    )
}
