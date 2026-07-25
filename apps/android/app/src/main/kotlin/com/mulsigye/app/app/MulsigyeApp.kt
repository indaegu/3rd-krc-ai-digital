package com.mulsigye.app.app

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.storage.RegionStoreState
import com.mulsigye.app.feature.consent.presentation.CONSENT_VERSION
import com.mulsigye.app.feature.consent.presentation.ConsentSheet
import com.mulsigye.app.feature.forecast.presentation.ForecastUiState
import com.mulsigye.app.feature.forecast.presentation.ForecastViewModel
import com.mulsigye.app.feature.forecast.presentation.TrendErrorScreen
import com.mulsigye.app.feature.forecast.presentation.TrendLoadingScreen
import com.mulsigye.app.feature.forecast.presentation.TrendScreen
import com.mulsigye.app.feature.onboarding.presentation.OnboardingScreen
import com.mulsigye.app.feature.policy.presentation.PolicyScreen
import com.mulsigye.app.feature.region.presentation.RegionAddScreen
import com.mulsigye.app.feature.region.presentation.RegionAddViewModel
import com.mulsigye.app.feature.region.presentation.RegionListScreen
import com.mulsigye.app.feature.region.presentation.RegionListViewModel
import com.mulsigye.app.feature.splash.presentation.SplashScreen
import com.mulsigye.app.feature.status.presentation.StatusUiState
import com.mulsigye.app.feature.status.presentation.StatusViewModel
import com.mulsigye.app.feature.coach.presentation.CoachViewModel
import com.mulsigye.app.feature.nearby.presentation.NearbyViewModel
import kotlinx.coroutines.launch

/**
 * 앱 진입점. 지역·동의 저장소(RegionStore) Flow를 관찰해 게이팅한다(웹 page.tsx 흐름과 동일).
 *
 * DataStore Flow는 비동기라 첫 방출 전에는 [store]가 null이다(웹엔 없는 초기 로딩 게이트).
 * 이때는 빈 배경만 두고, 첫 상태가 오면 [AppRouter]로 위임한다.
 */
@Composable
fun MulsigyeApp(container: AppContainer) {
    MulsigyeTheme {
        val store: RegionStoreState? by produceState<RegionStoreState?>(initialValue = null, container) {
            container.regionStore.regionStoreFlow.collect { value = it }
        }
        val current = store
        if (current == null) {
            // 초기 로딩 게이트: 저장소 첫 방출 전에는 흰 배경만(풀스크린 스피너 금지).
            Box(modifier = Modifier.fillMaxSize().background(Bg))
        } else {
            AppRouter(container = container, store = current)
        }
    }
}

/**
 * 상태 기반 라우터. 시작 화면은 [startScreen] 게이팅으로 한 번만 정하고, 이후 이동은
 * 명시적 콜백이 백스택을 조작한다(웹처럼 게이팅은 진입 1회). 하드웨어/제스처 뒤로가기는
 * 백스택을 pop 하며 루트에서는 앱을 종료(finish)한다.
 */
@Composable
fun AppRouter(container: AppContainer, store: RegionStoreState) {
    val initial = remember { startScreen(store) }
    val backStack = rememberBackStack(initial)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    // 스플래시는 메인을 처음 보여줄 때 1회만 오버레이한다(웹: 메인 최초 진입).
    var splashShown by rememberSaveable { mutableStateOf(false) }

    // #7 대표 지역: 콜드 스타트 시 처음 보여줄 지역을 목록 맨 위(index 0=대표)로 되돌린다.
    // rememberSaveable 가드라 프로세스 재생성(구성 변경·메모리 회수)에는 복원되어 다시 돌지 않고
    // (세션 중 헤더로 바꾼 currentIndex 유지), 오직 진짜 콜드 스타트에서만 1회 실행된다.
    var coldStartPrimaryReset by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!coldStartPrimaryReset) {
            coldStartPrimaryReset = true
            if (shouldResetToPrimaryOnColdStart(store)) {
                container.regionStore.selectRegion(PRIMARY_REGION_INDEX)
            }
        }
    }

    // #1 최초 사용자: 동의를 마쳤고 등록 이력이 없으며 지역이 비어 있으면 빈 상태 대신
    // 곧바로 지역 검색(RegionAdd)으로 보낸다. 지역을 모두 지운 재방문 사용자
    // (hasEverRegistered=true)는 대상이 아니라 기존 빈 상태를 유지한다. 한 세션에 1회만.
    var firstTimeSearchOpened by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(store.consentVersion, store.regions.isEmpty(), store.hasEverRegistered) {
        if (!firstTimeSearchOpened &&
            shouldOpenFirstTimeSearch(store) &&
            backStack.current == Screen.Regions
        ) {
            firstTimeSearchOpened = true
            backStack.push(Screen.RegionAdd)
        }
    }

    BackHandler(enabled = true) {
        if (!backStack.pop()) {
            (context as? Activity)?.finish()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Bg)) {
        // 상태바·내비게이션 바 인셋만큼 콘텐츠를 밀어 각 화면 상단 제목이 상태바에 먹히지 않게 한다
        // (targetSdk 35+는 edge-to-edge가 강제되므로 인셋 패딩이 필수다). 스플래시 오버레이는
        // 풀블리드로 보이도록 이 패딩 밖에 둔다.
        Box(modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            when (val current = backStack.current) {
                Screen.Onboarding -> OnboardingScreen(
                    // CTA → 지역 설정으로. 그곳에서 동의 시트가 자동으로 열린다(consent 없을 때).
                    onDone = { backStack.push(Screen.Regions) },
                )

                Screen.Regions -> RegionsRoute(container, store, backStack, scope)
                Screen.RegionAdd -> RegionAddRoute(container, backStack)
                Screen.Main -> MainRoute(container, store, backStack)
                Screen.Trend -> TrendRoute(container, store, backStack)

                is Screen.Policy -> PolicyScreen(
                    kind = current.kind,
                    onBack = { backStack.pop() },
                )

                // Splash는 오버레이로 다루므로 백스택 항목으로는 도달하지 않는다.
                Screen.Splash -> SplashScreen(onDone = { backStack.replaceAll(Screen.Main) })
            }
        }

        // 게이팅 완료 후 메인을 처음 보여줄 때만 스플래시 오버레이.
        if (backStack.current == Screen.Main && !splashShown) {
            SplashScreen(onDone = { splashShown = true })
        }
    }
}

@Composable
private fun RegionsRoute(
    container: AppContainer,
    store: RegionStoreState,
    backStack: BackStack,
    scope: kotlinx.coroutines.CoroutineScope,
) {
    val vm: RegionListViewModel = viewModel(
        factory = RegionListViewModel.Factory(container.regionStore, container.statusRepository),
    )
    val state by vm.uiState.collectAsStateWithLifecycle()

    RegionListScreen(
        state = state,
        onSelectRegion = vm::select,
        onRemoveRegion = vm::remove,
        onMoveRegion = vm::move,
        onNavigateAdd = { backStack.push(Screen.RegionAdd) },
        onStart = { backStack.replaceAll(Screen.Main) },
    )

    // 최초 진입(동의 없음)이면 필수 동의 시트를 자동으로 연다. 동의 시 저장소에 consent-v1 저장.
    if (store.consentVersion == null) {
        ConsentSheet(
            onAgree = { scope.launch { container.regionStore.setConsent(CONSENT_VERSION) } },
            onOpenPolicy = { kind -> backStack.push(Screen.Policy(kind)) },
        )
    }
}

@Composable
private fun RegionAddRoute(container: AppContainer, backStack: BackStack) {
    val vm: RegionAddViewModel = viewModel(
        factory = RegionAddViewModel.Factory(container.regionRepository, container.regionStore),
    )
    val state by vm.uiState.collectAsStateWithLifecycle()

    RegionAddScreen(
        state = state,
        onQueryChange = vm::onQueryChange,
        onCandidateSelect = vm::onCandidateSelect,
        onRetrySearch = vm::retrySearch,
        onRetryResolve = vm::retryResolve,
        onDismissResolve = vm::dismissResolve,
        // 등록 후 지역 목록으로 복귀한다.
        onRegister = { vm.register { backStack.pop() } },
        onBack = { backStack.pop() },
    )
}

@Composable
private fun MainRoute(container: AppContainer, store: RegionStoreState, backStack: BackStack) {
    val regionCode = store.regions.getOrNull(store.currentIndex)?.sigunCode
    if (regionCode == null) {
        // 방어: 메인인데 지역이 없으면 지역 설정으로 되돌린다.
        backStack.replaceAll(Screen.Regions)
        return
    }

    val statusVm: StatusViewModel = viewModel(
        key = "status-$regionCode",
        factory = StatusViewModel.Factory(container.statusRepository, regionCode),
    )
    val forecastVm: ForecastViewModel = viewModel(
        key = "forecast-$regionCode",
        factory = ForecastViewModel.Factory(container.forecastRepository, regionCode),
    )
    val coachVm: CoachViewModel = viewModel(
        key = "coach-$regionCode",
        factory = CoachViewModel.Factory(container.coachRepository, regionCode),
    )
    val nearbyVm: NearbyViewModel = viewModel(
        key = "nearby-$regionCode",
        factory = NearbyViewModel.Factory(container.nearbyRepository, regionCode),
    )

    val statusState by statusVm.uiState.collectAsStateWithLifecycle()
    val forecastState by forecastVm.uiState.collectAsStateWithLifecycle()
    val coachState by coachVm.uiState.collectAsStateWithLifecycle()
    val nearbyState by nearbyVm.uiState.collectAsStateWithLifecycle()

    // 새로고침·모듈 재시도는 네 모듈을 함께 다시 부른다(웹 refresh와 동일, 각 VM이 로딩 중이면 무시).
    val refresh: () -> Unit = {
        statusVm.refresh()
        forecastVm.refresh()
        coachVm.refresh()
        nearbyVm.refresh()
    }

    MainScreen(
        statusState = statusState,
        forecastState = forecastState,
        coachState = coachState,
        nearbyState = nearbyState,
        onRefresh = refresh,
        onNavigateRegions = { backStack.push(Screen.Regions) },
        onNavigateTrend = { backStack.push(Screen.Trend) },
    )
}

@Composable
private fun TrendRoute(container: AppContainer, store: RegionStoreState, backStack: BackStack) {
    val regionCode = store.regions.getOrNull(store.currentIndex)?.sigunCode
    if (regionCode == null) {
        backStack.pop()
        return
    }
    val forecastVm: ForecastViewModel = viewModel(
        key = "trend-forecast-$regionCode",
        factory = ForecastViewModel.Factory(container.forecastRepository, regionCode),
    )
    val state by forecastVm.uiState.collectAsStateWithLifecycle()

    when (val forecast = state) {
        is ForecastUiState.Ready -> TrendScreen(data = forecast.data, onBack = { backStack.pop() })
        // 로딩은 흐름 상세 레이아웃을 그대로 흉내 낸 스켈레톤으로(풀스크린 스피너·밋밋한 텍스트 금지).
        is ForecastUiState.Loading -> TrendLoadingScreen(onBack = { backStack.pop() })
        is ForecastUiState.Error -> TrendErrorScreen(
            message = forecast.message,
            retryable = forecast.retryable,
            onRetry = forecastVm::refresh,
            onBack = { backStack.pop() },
        )
    }
}
