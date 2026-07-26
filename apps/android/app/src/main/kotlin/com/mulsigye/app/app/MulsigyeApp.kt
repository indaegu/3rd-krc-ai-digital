package com.mulsigye.app.app

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.notifications.WaterNotifications
import com.mulsigye.app.BuildConfig
import com.mulsigye.app.core.storage.NotificationHistoryEntry
import com.mulsigye.app.core.storage.RegionStoreState
import com.mulsigye.app.feature.notifications.presentation.NotificationInboxScreen
import com.mulsigye.app.feature.notifications.presentation.NotificationSettingsScreen
import com.mulsigye.app.feature.notifications.presentation.NotificationSettingsViewModel
import com.mulsigye.app.feature.notifications.work.NotificationScheduler
import com.mulsigye.app.feature.consent.presentation.CONSENT_VERSION
import com.mulsigye.app.feature.consent.presentation.ConsentSheet
import com.mulsigye.app.feature.forecast.presentation.ForecastUiState
import com.mulsigye.app.feature.forecast.presentation.ForecastViewModel
import com.mulsigye.app.feature.forecast.presentation.TrendErrorScreen
import com.mulsigye.app.feature.forecast.presentation.TrendLoadingScreen
import com.mulsigye.app.feature.forecast.presentation.TrendScreen
import com.mulsigye.app.feature.onboarding.presentation.OnboardingScreen
import com.mulsigye.app.feature.policy.presentation.PolicyScreen
import com.mulsigye.app.feature.settings.presentation.AppSettingsScreen
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

// #2 동의 시트 뒤 콘텐츠 블러 강도. 뒤 텍스트가 읽히지 않을 만큼 충분히 흐리게(API 31+).
private val ConsentBackdropBlur = 18.dp

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

    // 앱을 열 때마다 현재 알림 설정으로 스케줄을 다시 건다(시각이 이동했거나 재부팅으로 취소된 경우 보정).
    // 옵트인이 꺼져 있으면 reschedule가 작업을 취소하므로, 켜지 않은 사용자에겐 아무 일도 없다.
    val appContext = context.applicationContext
    LaunchedEffect(Unit) {
        NotificationScheduler.reschedule(appContext, container.notificationPrefsStore.current())
    }

    // 동의를 마치면 지역 목록에 머문다. 예전에는 최초 사용자를 곧바로 주소 검색으로 보냈지만,
    // 목록에서 "지역 추가하기"로 직접 들어가는 흐름이 덜 갑작스러워 그 자동 진입을 없앴다.

    BackHandler(enabled = true) {
        if (!backStack.pop()) {
            (context as? Activity)?.finish()
        }
    }

    // #2 필수 동의 시트가 열려 있으면(동의 미설정 + 지역 화면) 뒤 콘텐츠 전체를 블러 처리해 뒤 텍스트를
    // 읽을 수 없게 만든다. 시트는 별도 창(ModalBottomSheet)에 그려지므로 이 블러가 시트엔 닿지 않는다.
    // API 31+에서 실제 렌더되고, 그 이하에선 시트의 진한 스크림이 폴백으로 배경을 가린다.
    val blurBehindConsent = shouldBlurBehindConsent(store, backStack.current)

    Box(modifier = Modifier.fillMaxSize().background(Bg)) {
        // 상태바·내비게이션 바 인셋만큼 콘텐츠를 밀어 각 화면 상단 제목이 상태바에 먹히지 않게 한다
        // (targetSdk 35+는 edge-to-edge가 강제되므로 인셋 패딩이 필수다). 스플래시 오버레이는
        // 풀블리드로 보이도록 이 패딩 밖에 둔다.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .then(if (blurBehindConsent) Modifier.blur(ConsentBackdropBlur) else Modifier),
        ) {
            when (val current = backStack.current) {
                Screen.Onboarding -> OnboardingScreen(
                    // CTA → 지역 설정으로. 그곳에서 동의 시트가 자동으로 열린다(consent 없을 때).
                    onDone = { backStack.push(Screen.Regions) },
                )

                Screen.Regions -> RegionsRoute(
                    container = container,
                    store = store,
                    backStack = backStack,
                    scope = scope,
                    // "시작하기"로 메인에 들어갈 때마다 전환 연출(스플래시)을 다시 재생한다.
                    onStart = {
                        splashShown = false
                        backStack.replaceAll(Screen.Main)
                    },
                )
                Screen.RegionAdd -> RegionAddRoute(container, backStack)
                Screen.Main -> MainRoute(container, store, backStack)
                Screen.Trend -> TrendRoute(container, store, backStack)
                Screen.NotificationSettings -> NotificationSettingsRoute(container, backStack)
                Screen.NotificationInbox -> NotificationInboxRoute(container, backStack)
                Screen.AppSettings -> AppSettingsScreen(
                    versionName = BuildConfig.VERSION_NAME,
                    onBack = { backStack.pop() },
                    onOpenNotificationSettings = { backStack.push(Screen.NotificationSettings) },
                    onOpenRegions = { backStack.push(Screen.Regions) },
                    onOpenTerms = { backStack.push(Screen.Policy(PolicyKind.TERMS)) },
                    onOpenPrivacy = { backStack.push(Screen.Policy(PolicyKind.PRIVACY)) },
                    onOpenLocationPolicy = { backStack.push(Screen.Policy(PolicyKind.LOCATION)) },
                )

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
    onStart: () -> Unit,
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
        onToggleManageMode = vm::toggleManageMode,
        onToggleSelection = vm::toggleSelection,
        onDeleteSelected = vm::deleteSelected,
        onNavigateAdd = { backStack.push(Screen.RegionAdd) },
        onNavigateNotifications = { backStack.push(Screen.NotificationSettings) },
        onStart = onStart,
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
        onRegister = { setAsPrimary -> vm.register(setAsPrimary) { backStack.pop() } },
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
        onNavigateNotificationInbox = { backStack.push(Screen.NotificationInbox) },
        onNavigateAppSettings = { backStack.push(Screen.AppSettings) },
    )
}

/**
 * 알림 설정 라우트. ViewModel(저장·스케줄)과 런타임 권한 요청(Android 13+)을 배선한다.
 * 마스터를 켤 때만 권한을 요청하고, 거부되면 토글을 끈 채 힌트를 보여준다(옵트인 유지).
 */
@Composable
private fun NotificationSettingsRoute(container: AppContainer, backStack: BackStack) {
    val context = LocalContext.current
    val appContext = context.applicationContext

    val vm: NotificationSettingsViewModel = viewModel(
        factory = NotificationSettingsViewModel.Factory(
            store = container.notificationPrefsStore,
            reschedule = { prefs -> NotificationScheduler.reschedule(appContext, prefs) },
        ),
    )
    val state by vm.uiState.collectAsStateWithLifecycle()

    // Android 13+ 알림 권한 요청 런처. 허용이면 마스터 on, 거부면 힌트.
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) vm.confirmEnable() else vm.markPermissionDenied()
    }

    NotificationSettingsScreen(
        state = state,
        onBack = { backStack.pop() },
        onToggleEnabled = { want ->
            if (want) {
                val needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS,
                    ) != PackageManager.PERMISSION_GRANTED
                if (needsPermission) {
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else if (WaterNotifications.canPost(context)) {
                    vm.confirmEnable()
                } else {
                    // 시스템 알림 자체가 꺼진 경우(권한은 있으나 채널/앱 알림 off).
                    vm.markPermissionDenied()
                }
            } else {
                vm.disable()
            }
        },
        onToggleDaily = vm::setDailyEnabled,
        onAdjustDailyTime = vm::setDailyTime,
        onToggleStageAlert = vm::setStageAlertEnabled,
    )
}

/**
 * 알림 모아보기 라우트 — 이 기기가 보낸 알림 기록(DataStore)을 최신순으로 보여준다.
 * 시각 문구는 기기 로케일 기준으로 여기서 포맷해 화면은 순수하게 유지한다.
 */
@Composable
private fun NotificationInboxRoute(container: AppContainer, backStack: BackStack) {
    val entries: List<NotificationHistoryEntry> by produceState(
        initialValue = emptyList(),
        container,
    ) {
        container.notificationHistoryStore.historyFlow.collect { value = it }
    }

    NotificationInboxScreen(
        entries = entries,
        onBack = { backStack.pop() },
        onOpenNotificationSettings = { backStack.push(Screen.NotificationSettings) },
        formatTime = { millis ->
            val formatter = java.text.SimpleDateFormat("M월 d일 a h:mm", java.util.Locale.KOREA)
            formatter.format(java.util.Date(millis))
        },
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
