package com.mulsigye.app.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.component.Shimmer
import androidx.compose.ui.text.font.FontWeight
import java.time.Instant
import com.mulsigye.app.core.designsystem.theme.brandGradientBrush
import com.mulsigye.app.core.designsystem.theme.CareBg
import com.mulsigye.app.core.designsystem.theme.CareText
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.ui.AsOfStamp
import com.mulsigye.app.core.ui.Disclaimer
import com.mulsigye.app.feature.coach.presentation.CoachCard
import com.mulsigye.app.feature.coach.presentation.CoachUiState
import com.mulsigye.app.feature.forecast.presentation.ForecastUiState
import com.mulsigye.app.feature.forecast.presentation.ReachCard
import com.mulsigye.app.feature.forecast.presentation.TrendChartCard
import com.mulsigye.app.feature.nearby.presentation.NearbyCompareCard
import com.mulsigye.app.feature.nearby.presentation.NearbyUiState
import com.mulsigye.app.feature.status.presentation.HighWaterBanner
import com.mulsigye.app.feature.status.presentation.MainHeader
import com.mulsigye.app.feature.status.presentation.SourcesCard
import com.mulsigye.app.feature.status.presentation.StatusUiState
import com.mulsigye.app.feature.status.presentation.TodayCard
import com.mulsigye.app.feature.status.presentation.mergeSources

/** 당겨서 새로고침에서 본문(카드들)이 손끝을 따라 내려오는 최대 거리. */
private val PullContentShift = 56.dp

/**
 * 메인 화면 전체 조립 — 순수 컴포저블(3개 모듈 상태 + 콜백만).
 *
 * status·forecast·coach는 각자 독립 로드되며, 한 모듈의 실패가 다른 모듈을 깨뜨리지 않는다
 * (웹 page.tsx 패턴). 모듈별 스켈레톤·stale·오류를 각 자리에서 처리한다.
 * 모듈 순서: MainHeader · 기준시각 스탬프 · (HighWaterBanner) · TodayCard(+게이지) ·
 * ReachCard · TrendChartCard · CoachCard · SourcesCard · 면책 문구.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    statusState: StatusUiState,
    forecastState: ForecastUiState,
    coachState: CoachUiState,
    nearbyState: NearbyUiState,
    onRefresh: () -> Unit,
    onNavigateRegions: () -> Unit,
    onNavigateTrend: () -> Unit,
    onNavigateNotificationInbox: () -> Unit,
    onNavigateAppSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // 헤더 드롭다운은 대표 지역명만 보여준다(시안 §3). 저수지명은 TodayCard 탭 라벨이 소유한다.
    val regionLabel = (statusState as? StatusUiState.Ready)?.data?.sigunName

    // 당겨서 새로고침 — 사용자가 화면을 끌어내렸을 때만 상단 인디케이터를 돌린다.
    // (첫 진입 로딩은 모듈 스켈레톤이 담당하므로 인디케이터를 띄우지 않는다.)
    var pullRefreshing by remember { mutableStateOf(false) }
    LaunchedEffect(statusState) {
        if (statusState !is StatusUiState.Loading) pullRefreshing = false
    }

    // 당겨서 새로고침 상태를 직접 들고 있는다 — 인디케이터만 내려오는 게 아니라
    // **본문(카드들)도 손끝을 따라 내려오게** 하려면 당긴 거리를 알아야 한다.
    val pullState = rememberPullToRefreshState()

    PullToRefreshBox(
        isRefreshing = pullRefreshing,
        onRefresh = {
            pullRefreshing = true
            onRefresh()
        },
        state = pullState,
        modifier = modifier
            .fillMaxSize()
            // 온보딩·스플래시와 같은 브랜드 그라디언트를 화면 전체에 깐다(시안).
            .background(brandGradientBrush()),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // 당긴 만큼 본문을 함께 내린다(최대 [PullContentShift]). 새로고침이 돌아가는
                // 동안에도 살짝 내려가 있어 "내용이 따라 나온" 느낌이 끊기지 않는다.
                .graphicsLayer {
                    val fraction = if (pullRefreshing) 1f else pullState.distanceFraction
                    translationY = fraction.coerceIn(0f, 1f) * PullContentShift.toPx()
                },
        ) {
        MainHeader(
            regionLabel = regionLabel,
            onNavigateRegions = onNavigateRegions,
            onNavigateNotificationInbox = onNavigateNotificationInbox,
            onNavigateAppSettings = onNavigateAppSettings,
        )

        // 기준시각 = 다시 불러오기 버튼(시안 헤더에는 새로고침 아이콘이 없다). 당겨서 새로고침도 그대로.
        stampText(statusState)?.let { stamp ->
            Box(
                modifier = Modifier
                    .clickable(onClick = onRefresh)
                    .semantics { contentDescription = "새로고침" }
                    .sizeIn(minHeight = 48.dp)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    text = stamp,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink2,
                )
            }
        }

        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ①-a 오프라인 안내 — 저장해 둔 값을 보고 있음을 먼저 알린다.
            OfflineBanner(cachedAt = offlineCachedAt(statusState, forecastState))

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
                    ReachCard(
                        forecast = forecastState.data,
                        currentStageCode = (statusState as? StatusUiState.Ready)?.data?.region?.officialStage?.code,
                    )
                    TrendChartCard(
                        forecast = forecastState.data,
                        onDetail = onNavigateTrend,
                        reservoirHistory = (statusState as? StatusUiState.Ready)?.data?.reservoir?.rateHistory
                            ?: emptyList(),
                        reservoirName = (statusState as? StatusUiState.Ready)?.data?.reservoir?.name,
                    )
                }
                is ForecastUiState.Error -> ModuleError(
                    title = "흐름 예측을 불러오지 못했어요",
                    message = forecastState.message,
                    retryable = forecastState.retryable,
                    onRetry = onRefresh,
                )
            }

            // ④ 수신호 코치 — 비차단(스켈레톤·오류는 모듈이 소유).
            CoachCard(state = coachState, onRetry = onRefresh)

            // ④-b 주변 지역 비교 — 같은 시·도 안에서 우리 지역 물 사정 비교(비차단).
            // 준비되면 보여주고, 로딩·실패면 카드를 조용히 감춘다(웹과 동일 — 화면을 깨지 않는다).
            (nearbyState as? NearbyUiState.Ready)?.let { NearbyCompareCard(data = it.data) }

            // ⑤ 근거·한계 고지 — coach와 무관하게 status가 로드되면 항상 표시.
            if (statusState is StatusUiState.Ready) {
                val forecastSources = (forecastState as? ForecastUiState.Ready)?.data?.sources ?: emptyList()
                val forecastStale = (forecastState as? ForecastUiState.Ready)?.data?.stale ?: false
                SourcesCard(
                    sources = mergeSources(statusState.data.sources, forecastSources),
                    stale = statusState.data.stale || forecastStale,
                    estimate = statusState.data.region.estimate,
                    estimateObservedOn = statusState.data.region.observedOn,
                )
            }

            Disclaimer()
            Spacer(Modifier.height(8.dp))
            }
        }
    }
}

/** 기준시각 스탬프 문안. 웹 stampText와 동일 규칙(로딩·stale·정상). 오류면 null. */
private fun stampText(state: StatusUiState): String? = when (state) {
    is StatusUiState.Loading -> AsOfStamp.LOADING_TEXT
    is StatusUiState.Error -> null
    is StatusUiState.Ready -> {
        val data = state.data
        val cachedAt = data.cachedAt
        if (cachedAt != null) {
            // 저장본은 서버 asOf가 아니라 "언제 받았는지"가 기준이다.
            AsOfStamp.offlineText(cachedAt, Instant.now())
        } else if (data.stale) {
            val observedOn = data.reservoir.observedOn ?: data.region.observedOn
            AsOfStamp.delayedText(observedOn)
        } else {
            AsOfStamp.freshText(data.asOf)
        }
    }
}

/**
 * 둘 중 먼저 받은(= 가장 오래된) 저장 시각. 둘 다 생중계면 null.
 *
 * status만 오프라인이고 forecast는 방금 받았을 수 있다. 사용자에게는 화면에 섮인 가장
 * 오래된 값이 중요하므로 더 이전 시각을 알린다 — 실제보다 새것처럼 보이지 않게.
 */
internal fun offlineCachedAt(
    statusState: StatusUiState,
    forecastState: ForecastUiState,
): Instant? {
    val statusCachedAt = (statusState as? StatusUiState.Ready)?.data?.cachedAt
    val forecastCachedAt = (forecastState as? ForecastUiState.Ready)?.data?.cachedAt
    return listOfNotNull(statusCachedAt, forecastCachedAt).minOrNull()
}

/**
 * 통신이 끊겼을 때 띄우는 안내. 화면을 오류로 바꾸지 않고 직전 값을 그대로 둔다.
 *
 * 저수지 옆은 음영지역이 많아 "인터넷 연결을 확인해 주세요"만 남으면 정작 볼 것을 못 본다.
 * 다만 오래된 값을 오늘 값으로 오해하면 더 위험하므로, 언제 받은 값인지를 함께 적는다.
 */
@Composable
internal fun OfflineBanner(cachedAt: Instant?, modifier: Modifier = Modifier) {
    if (cachedAt == null) {
        return
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(CareBg, RoundedCornerShape(18.dp))
            .padding(horizontal = 16.dp, vertical = 14.dp)
            .semantics { contentDescription = "오프라인 안내" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "오프라인",
            color = CareText,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelMedium,
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = "지금은 인터넷이 연결되지 않아 " +
                AsOfStamp.offlineText(cachedAt, Instant.now()) + ".",
            color = Ink2,
            style = MaterialTheme.typography.bodyMedium,
        )
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
            Shimmer(modifier = Modifier.width(118.dp).height(196.dp))
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
