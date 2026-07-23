package com.mulsigye.app.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.component.Shimmer
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.ui.AsOfStamp
import com.mulsigye.app.core.ui.Disclaimer
import com.mulsigye.app.feature.coach.presentation.CoachCard
import com.mulsigye.app.feature.coach.presentation.CoachUiState
import com.mulsigye.app.feature.forecast.presentation.ForecastUiState
import com.mulsigye.app.feature.forecast.presentation.ReachCard
import com.mulsigye.app.feature.forecast.presentation.TrendChartCard
import com.mulsigye.app.feature.status.presentation.HighWaterBanner
import com.mulsigye.app.feature.status.presentation.MainHeader
import com.mulsigye.app.feature.status.presentation.SourcesCard
import com.mulsigye.app.feature.status.presentation.StatusUiState
import com.mulsigye.app.feature.status.presentation.TodayCard
import com.mulsigye.app.feature.status.presentation.mergeSources

/**
 * 메인 화면 전체 조립 — 순수 컴포저블(3개 모듈 상태 + 콜백만).
 *
 * status·forecast·coach는 각자 독립 로드되며, 한 모듈의 실패가 다른 모듈을 깨뜨리지 않는다
 * (웹 page.tsx 패턴). 모듈별 스켈레톤·stale·오류를 각 자리에서 처리한다.
 * 모듈 순서: MainHeader · 기준시각 스탬프 · (HighWaterBanner) · TodayCard(+게이지) ·
 * ReachCard · TrendChartCard · CoachCard · SourcesCard · 면책 문구.
 */
@Composable
fun MainScreen(
    statusState: StatusUiState,
    forecastState: ForecastUiState,
    coachState: CoachUiState,
    onRefresh: () -> Unit,
    onNavigateRegions: () -> Unit,
    onNavigateTrend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val regionLabel = (statusState as? StatusUiState.Ready)?.data?.let {
        "${it.sigunName} · ${it.reservoir.name}"
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState()),
    ) {
        MainHeader(
            regionLabel = regionLabel,
            refreshing = statusState is StatusUiState.Loading,
            onRefresh = onRefresh,
            onNavigateRegions = onNavigateRegions,
        )

        stampText(statusState)?.let { stamp ->
            Text(
                text = stamp,
                style = MaterialTheme.typography.bodyMedium,
                color = Ink2,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
        }

        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ① 오늘 우리 저수지.
            when (statusState) {
                is StatusUiState.Loading -> TodayCardSkeleton()
                is StatusUiState.Ready -> {
                    HighWaterBanner(notice = statusState.data.highWaterNotice)
                    TodayCard(status = statusState.data)
                }
                is StatusUiState.Error -> ModuleError(
                    title = "지금은 물 사정을 불러오지 못했어요",
                    message = statusState.message,
                    retryable = statusState.retryable,
                    onRetry = onRefresh,
                )
            }

            // ② 이 추세라면 · ③ 저수율 흐름.
            when (forecastState) {
                is ForecastUiState.Loading -> ForecastSkeleton()
                is ForecastUiState.Ready -> {
                    ReachCard(forecast = forecastState.data)
                    TrendChartCard(forecast = forecastState.data, onDetail = onNavigateTrend)
                }
                is ForecastUiState.Error -> ModuleError(
                    title = "흐름 예측을 불러오지 못했어요",
                    message = forecastState.message,
                    retryable = forecastState.retryable,
                    onRetry = onRefresh,
                )
            }

            // ④ 물시계 코치 — 비차단(스켈레톤·오류는 모듈이 소유).
            CoachCard(state = coachState, onRetry = onRefresh)

            // ⑤ 근거·한계 고지 — coach와 무관하게 status가 로드되면 항상 표시.
            if (statusState is StatusUiState.Ready) {
                val forecastSources = (forecastState as? ForecastUiState.Ready)?.data?.sources ?: emptyList()
                val forecastStale = (forecastState as? ForecastUiState.Ready)?.data?.stale ?: false
                SourcesCard(
                    sources = mergeSources(statusState.data.sources, forecastSources),
                    stale = statusState.data.stale || forecastStale,
                )
            }

            Disclaimer()
            Spacer(Modifier.height(8.dp))
        }
    }
}

/** 기준시각 스탬프 문안. 웹 stampText와 동일 규칙(로딩·stale·정상). 오류면 null. */
private fun stampText(state: StatusUiState): String? = when (state) {
    is StatusUiState.Loading -> AsOfStamp.LOADING_TEXT
    is StatusUiState.Error -> null
    is StatusUiState.Ready -> {
        val data = state.data
        if (data.stale) {
            val observedOn = data.reservoir.observedOn ?: data.region.observedOn
            AsOfStamp.delayedText(observedOn)
        } else {
            AsOfStamp.freshText(data.asOf)
        }
    }
}

@Composable
private fun ModuleError(
    title: String,
    message: String,
    retryable: Boolean,
    onRetry: () -> Unit,
) {
    MulsigyeCard {
        Text(
            text = title,
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

/** 오늘 우리 저수지 모듈 스켈레톤(모듈별 shimmer — 풀스크린 스피너 금지). */
@Composable
private fun TodayCardSkeleton() {
    MulsigyeCard {
        Shimmer(modifier = Modifier.width(96.dp).height(14.dp))
        Spacer(Modifier.height(12.dp))
        Row {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Shimmer(modifier = Modifier.width(120.dp).height(44.dp))
                Shimmer(modifier = Modifier.width(90.dp).height(14.dp))
                Shimmer(modifier = Modifier.width(64.dp).height(24.dp))
                Shimmer(modifier = Modifier.width(150.dp).height(14.dp))
            }
            Spacer(Modifier.width(16.dp))
            Shimmer(modifier = Modifier.width(74.dp).height(196.dp))
        }
    }
}

/** 예측 모듈(이 추세라면·저수율 흐름) 스켈레톤. */
@Composable
private fun ForecastSkeleton() {
    MulsigyeCard {
        Shimmer(modifier = Modifier.width(96.dp).height(14.dp))
        Spacer(Modifier.height(12.dp))
        Shimmer(modifier = Modifier.width(140.dp).height(40.dp))
        Spacer(Modifier.height(8.dp))
        Shimmer(modifier = Modifier.width(220.dp).height(14.dp))
    }
    Spacer(Modifier.height(16.dp))
    MulsigyeCard {
        Shimmer(modifier = Modifier.width(200.dp).height(14.dp))
        Spacer(Modifier.height(12.dp))
        Shimmer(modifier = Modifier.fillMaxWidth().height(180.dp))
    }
}
