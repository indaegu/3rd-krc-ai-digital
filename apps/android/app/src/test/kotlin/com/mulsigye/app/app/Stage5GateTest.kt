package com.mulsigye.app.app

import android.content.Context
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ApplicationProvider
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.testing.CoachFixtures
import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.core.testing.ForecastFixtures
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.core.testing.StatusFixtures
import com.mulsigye.app.feature.coach.data.DefaultCoachRepository
import com.mulsigye.app.feature.coach.data.remote.CoachApi
import com.mulsigye.app.feature.coach.data.remote.CoachResponseDto
import com.mulsigye.app.feature.coach.presentation.CoachUiState
import com.mulsigye.app.feature.coach.presentation.CoachViewModel
import com.mulsigye.app.feature.forecast.data.DefaultForecastRepository
import com.mulsigye.app.feature.forecast.data.remote.ForecastApi
import com.mulsigye.app.feature.forecast.data.remote.ForecastResponseDto
import com.mulsigye.app.feature.forecast.presentation.ForecastUiState
import com.mulsigye.app.feature.forecast.presentation.ForecastViewModel
import com.mulsigye.app.feature.status.data.DefaultStatusRepository
import com.mulsigye.app.feature.status.data.remote.StatusApi
import com.mulsigye.app.feature.status.data.remote.StatusResponseDto
import com.mulsigye.app.feature.status.presentation.StatusUiState
import com.mulsigye.app.feature.status.presentation.StatusViewModel
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/**
 * 단계 5 완료 게이트(자동화분) — 웹 `stage4-gate.test.ts`의 Android 대응.
 *
 * 계약 픽스처(4상태 + stale)를 **MockWebServer**로 서빙하고, 프로덕션과 동일한 Retrofit +
 * Repository + ViewModel을 거쳐 실제 [MainScreen]을 Robolectric으로 렌더한 뒤 다음을 강제한다:
 *
 *  ① 4개 상태(정상·관심·경계·만수위) 메인 전체가 rate·avgRatio·단계 칩·도달일·만수위 배너·
 *     행동 3개·공식 우선 고지와 product.md 상태 표대로 정합.
 *  ② stale에서 지연 안내를 덧붙이되 화면 구조는 유지(오류 카드로 바뀌지 않음).
 *  ③ 카피 감사 — 렌더 텍스트/접근성 이름에 금지 단정 표현·"가까운 저수지"·알림·로그인 0건,
 *     모든 예측 표시에 "공식 가뭄 예·경보가 우선" 고지 존재.
 *  ④ 접근성 자동화분 — heading semantics·클릭 요소 접근 가능한 이름·차트 contentDescription·
 *     reduced-motion 분기(ANIMATOR_DURATION_SCALE=0에서 카운트업 애니메이션 미적용·즉시 확정).
 *  ⑤ DTO ↔ openapi 파싱 정합 — 픽스처는 packages/contracts/examples와 byte 동일하므로,
 *     프로덕션 직렬화기로 디코드한 계약값을 함께 단언한다.
 *
 * Robolectric에서 여러 화면 상태를 한 함수로 렌더할 수 없어(컴포지션 1회) 상태별로 함수를 나눈다.
 * 접근성은 semantics 트리로 자동 검증 가능한 부분만 다루며, 실 TalkBack 낭독·큰 글꼴·실기기는
 * 사람 QA(Task 9)로 남긴다.
 */
class Stage5GateTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    // 프로덕션 AppContainer와 동일 설정(v1 additive 견고성).
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    // ── 계약 픽스처와 산술 정합인 4상태 + stale 기대값(product.md 상태 표). ──────────────
    private data class Scenario(
        val label: String,
        val statusFixture: String,
        val forecastFixture: String,
        val coachFixture: String,
        val sigunCode: String,
        val sigunName: String,
        val reservoirName: String,
        val rate: String,
        val avgRatio: String,
        val stageLabel: String,
        val highWater: Boolean,
        val reachDays: String?,
        val reachStageLabel: String?,
    )

    private val normal = Scenario(
        label = "정상", statusFixture = "status.normal.json", forecastFixture = "forecast.normal.json",
        coachFixture = "coach.static.json", sigunCode = "44230", sigunName = "논산시", reservoirName = "탑정",
        rate = "84", avgRatio = "103", stageLabel = "정상", highWater = false,
        reachDays = null, reachStageLabel = null,
    )
    private val watch = Scenario(
        label = "관심", statusFixture = "status.watch.json", forecastFixture = "forecast.watch.json",
        coachFixture = "coach.static.json", sigunCode = "46170", sigunName = "나주시", reservoirName = "나주호",
        rate = "57", avgRatio = "68", stageLabel = "관심", highWater = false,
        reachDays = "18", reachStageLabel = "주의",
    )
    private val severe = Scenario(
        label = "경계", statusFixture = "status.severe.json", forecastFixture = "forecast.severe.json",
        coachFixture = "coach.static.json", sigunCode = "50110", sigunName = "제주시", reservoirName = "상대",
        rate = "33", avgRatio = "46", stageLabel = "경계", highWater = false,
        reachDays = "9", reachStageLabel = "심각",
    )
    private val flood = Scenario(
        label = "만수위", statusFixture = "status.flood.json", forecastFixture = "forecast.flood.json",
        coachFixture = "coach.static.json", sigunCode = "26710", sigunName = "기장군", reservoirName = "병산",
        rate = "96", avgRatio = "118", stageLabel = "정상", highWater = true,
        reachDays = null, reachStageLabel = null,
    )

    /** 예측을 사실로 단정하는 금지 표현(규칙 3·product.md 카피 규칙) + 유도 문구. */
    private val forbidden = listOf(
        "내려가요", "발생합니다", "됩니다", "위험합니다", // 금지 단정
        "가까운 저수지", "알림", "로그인", // 거리·푸시·계정 유도 금지
    )

    // ── MockWebServer: 경로별로 계약 픽스처를 서빙(3개 병렬 호출을 순서 무관하게). ──────────
    private fun serveFixtures(statusFixture: String, forecastFixture: String, coachFixture: String) {
        val statusBody = Fixtures.read(statusFixture)
        val forecastBody = Fixtures.read(forecastFixture)
        val coachBody = Fixtures.read(coachFixture)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path ?: ""
                val body = when {
                    path.contains("/api/v1/forecast") -> forecastBody
                    path.contains("/api/v1/coach") -> coachBody
                    path.contains("/api/v1/status") -> statusBody
                    else -> return MockResponse().setResponseCode(404)
                }
                return MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody(body)
            }
        }
    }

    private fun setReducedMotion(scale: Float) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        Settings.Global.putFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, scale)
    }

    /**
     * 프로덕션 Retrofit + Repository + ViewModel을 실제로 배선해 [MainScreen]을 렌더하고,
     * 세 모듈이 모두 Ready가 될 때까지 기다린다. reduced-motion=on으로 카운트업을 즉시 확정해
     * 트리를 안정화한다(장식 무한 애니메이션과 무관한 값 단언).
     */
    private fun renderMainViaNetwork(scenario: Scenario) {
        setReducedMotion(0f) // 카운트업 즉시 확정 → rate 값이 곧바로 최종치.
        serveFixtures(scenario.statusFixture, scenario.forecastFixture, scenario.coachFixture)

        val retrofit = ApiClient.create(server.url("/").toString(), json)
        val statusRepo = DefaultStatusRepository(retrofit.create(StatusApi::class.java), json)
        val forecastRepo = DefaultForecastRepository(retrofit.create(ForecastApi::class.java), json)
        val coachRepo = DefaultCoachRepository(retrofit.create(CoachApi::class.java), json)

        val statusVm = StatusViewModel(statusRepo, scenario.sigunCode)
        val forecastVm = ForecastViewModel(forecastRepo, scenario.sigunCode)
        val coachVm = CoachViewModel(coachRepo, scenario.sigunCode)

        composeTestRule.setContent {
            MulsigyeTheme {
                val statusState by statusVm.uiState.collectAsState()
                val forecastState by forecastVm.uiState.collectAsState()
                val coachState by coachVm.uiState.collectAsState()
                MainScreen(
                    statusState = statusState,
                    forecastState = forecastState,
                    coachState = coachState,
                    onRefresh = {},
                    onNavigateRegions = {},
                    onNavigateTrend = {},
                )
            }
        }

        // 실 네트워크(OkHttp 백그라운드) 완료 후 세 모듈이 Ready가 될 때까지 대기.
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            hasText("우리 지역 대표 저수지") && // status Ready
                hasText("이 추세라면") && // forecast Ready
                hasText("지금 할 일을 하나씩 확인해요.") // coach Ready(headline)
        }
    }

    private fun hasText(text: String): Boolean =
        composeTestRule.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()

    // 세로 스크롤 화면이라 폴드 아래 모듈은 뷰포트에 없다 → 웹 게이트처럼 "표시 여부"가 아니라
    // 렌더 트리 "존재"로 파리티를 검증한다(getByText 대응).
    private fun assertPresent(text: String, substring: Boolean = false) {
        assertTrue(
            "렌더 트리에 없음: $text",
            composeTestRule.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty(),
        )
    }

    private fun assertAbsent(text: String, substring: Boolean = false) {
        composeTestRule.onAllNodesWithText(text, substring = substring).assertCountEquals(0)
    }

    private fun assertCdPresent(cd: String, substring: Boolean = false) {
        assertTrue(
            "접근성 이름 없음: $cd",
            composeTestRule.onAllNodesWithContentDescription(cd, substring = substring).fetchSemanticsNodes().isNotEmpty(),
        )
    }

    /** unmerged 트리 전체의 Text·EditableText·contentDescription을 한 문자열로 모은다(카피 감사용). */
    private fun collectAllText(): String {
        val sb = StringBuilder()
        fun visit(node: SemanticsNode) {
            node.config.getOrNull(SemanticsProperties.Text)?.forEach { sb.append(it.text).append('\n') }
            node.config.getOrNull(SemanticsProperties.EditableText)?.let { sb.append(it.text).append('\n') }
            node.config.getOrNull(SemanticsProperties.ContentDescription)?.forEach { sb.append(it).append('\n') }
            node.children.forEach { visit(it) }
        }
        visit(composeTestRule.onRoot(useUnmergedTree = true).fetchSemanticsNode())
        return sb.toString()
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ① 4개 상태 메인 전체 트리 렌더 — product.md 상태 표 정합 (+ ③ 카피 감사 병행)
    // ─────────────────────────────────────────────────────────────────────────────

    private fun assertMainMatches(scenario: Scenario) {
        renderMainViaNetwork(scenario)

        // rate(대표 저수지 원저수율) — reduced-motion에서 카운트업은 즉시 최종 값.
        assertPresent(scenario.rate)

        // avgRatio(지역 평년 대비) + 단계 칩 라벨 + 보조 라벨.
        assertPresent("지역 평년 대비 ${scenario.avgRatio}%", substring = true)
        assertPresent(scenario.stageLabel, substring = true)
        assertPresent("지역 평년 대비 기준")

        // 도달일(이 추세라면).
        val days = scenario.reachDays
        if (days != null) {
            assertPresent(days)
            assertPresent("‘${scenario.reachStageLabel}’ 단계에 들어설 가능성이 있어요", substring = true)
        } else {
            assertPresent("안정")
        }

        // 만수위 참고 배너는 highWaterNotice=true(만수위)에서만.
        if (scenario.highWater) {
            assertPresent("만수위에 가까워요", substring = true)
        } else {
            assertAbsent("만수위에 가까워요", substring = true)
        }

        // 물시계 코치 행동 3개(정적 코치 계약값).
        assertPresent("물시계 코치")
        listOf(
            "물꼬를 조금만 열어 두어요",
            "공식 가뭄 안내를 확인해요",
            "물 대는 순서를 정해요",
        ).forEach { title -> assertPresent(title) }

        // 모든 예측 화면 공통 고지.
        assertPresent("예측은 참고용이며 공식 가뭄 예·경보가 우선이에요.")

        // ③ 카피 감사: 금지 표현·유도 문구 0건 + 공식 우선 고지 존재.
        val text = collectAllText()
        forbidden.forEach { word ->
            assertFalse("[${scenario.label}] 금지 표현 발견: $word", text.contains(word))
        }
        assertTrue("[${scenario.label}] 공식 우선 고지 누락", text.contains("공식 가뭄 예·경보가 우선"))
    }

    @Test
    fun mainMatchesProductTableForNormal() = assertMainMatches(normal)

    @Test
    fun mainMatchesProductTableForWatch() = assertMainMatches(watch)

    @Test
    fun mainMatchesProductTableForSevere() = assertMainMatches(severe)

    @Test
    fun mainMatchesProductTableForFlood() = assertMainMatches(flood)

    // ─────────────────────────────────────────────────────────────────────────────
    // ② stale — 지연 안내를 덧붙이되 화면 구조 유지(오류 카드로 바뀌지 않음)
    // ─────────────────────────────────────────────────────────────────────────────

    @Test
    fun stalePreservesScreenAndAddsDelayNotice() {
        setReducedMotion(0f)
        serveFixtures("status.stale.json", "forecast.normal.json", "coach.stale.json")

        val retrofit = ApiClient.create(server.url("/").toString(), json)
        val statusRepo = DefaultStatusRepository(retrofit.create(StatusApi::class.java), json)
        val forecastRepo = DefaultForecastRepository(retrofit.create(ForecastApi::class.java), json)
        val coachRepo = DefaultCoachRepository(retrofit.create(CoachApi::class.java), json)

        val statusVm = StatusViewModel(statusRepo, "46170")
        val forecastVm = ForecastViewModel(forecastRepo, "46170")
        val coachVm = CoachViewModel(coachRepo, "46170")

        composeTestRule.setContent {
            MulsigyeTheme {
                val statusState by statusVm.uiState.collectAsState()
                val forecastState by forecastVm.uiState.collectAsState()
                val coachState by coachVm.uiState.collectAsState()
                MainScreen(statusState, forecastState, coachState, {}, {}, {})
            }
        }

        composeTestRule.waitUntil(timeoutMillis = 10_000) { hasText("우리 지역 대표 저수지") }

        // 기준시각 스탬프에 지연 안내(관측 기준일 + "지연된 정보예요").
        assertPresent("2026-07-14 기준 · 지연된 정보예요")
        // 근거 고지의 지연 안내.
        assertPresent("일부 공공데이터가 지연되어", substring = true)
        // 화면 구조 유지: 상태 모듈은 그대로 뜨고 오류 카드로 대체되지 않는다.
        assertPresent("우리 지역 대표 저수지")
        assertAbsent("지금은 물 사정을 불러오지 못했어요")
        // rate가 null이라 관측 폴백 문구를 보여준다(구조 불변).
        assertPresent("관측값을 불러오지 못했어요")
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ④ 접근성 자동화분 — heading·클릭 요소 이름·차트 contentDescription
    // ─────────────────────────────────────────────────────────────────────────────

    @Test
    fun accessibilitySemanticsHold() {
        renderMainViaNetwork(watch) // 도달일이 있는 관심 상태.

        // heading semantics가 붙은 노드가 여럿 존재한다(제목 계층).
        val headings = ArrayList<SemanticsNode>()
        fun collectHeadings(node: SemanticsNode) {
            if (node.config.getOrNull(SemanticsProperties.Heading) != null) headings += node
            node.children.forEach { collectHeadings(it) }
        }
        collectHeadings(composeTestRule.onRoot(useUnmergedTree = true).fetchSemanticsNode())
        assertTrue("heading semantics 노드가 없음", headings.size >= 3)

        // 클릭 가능한 요소는 모두 접근 가능한 이름(text 또는 contentDescription)을 가진다.
        fun assertClickableNamed(node: SemanticsNode) {
            if (node.config.getOrNull(SemanticsActions.OnClick) != null) {
                val texts = node.config.getOrNull(SemanticsProperties.Text)?.joinToString(" ") { it.text }.orEmpty()
                val cd = node.config.getOrNull(SemanticsProperties.ContentDescription)?.joinToString(" ").orEmpty()
                assertTrue("이름 없는 클릭 요소 발견", (texts + cd).isNotBlank())
            }
            node.children.forEach { assertClickableNamed(it) }
        }
        assertClickableNamed(composeTestRule.onRoot(useUnmergedTree = false).fetchSemanticsNode())

        // 아이콘 단독/합성 버튼의 접근 가능한 이름.
        assertCdPresent("새로고침")
        assertCdPresent("지역 설정")
        assertCdPresent("흐름 자세히 보기")

        // 차트 contentDescription(시각 요약 포함).
        assertCdPresent("지역 평년 대비 저수율 흐름", substring = true)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ④ reduced-motion 분기 — ANIMATOR_DURATION_SCALE=0에서 카운트업 즉시 확정
    // ─────────────────────────────────────────────────────────────────────────────

    /** 동기 Ready 상태로 [MainScreen]을 렌더한다(클럭 제어를 위해 네트워크 배제). */
    private fun setContentReadyMain(scenario: Scenario) {
        val status = StatusUiState.Ready(StatusFixtures.success(scenario.statusFixture))
        val forecast = ForecastUiState.Ready(ForecastFixtures.success(scenario.forecastFixture))
        val coach = CoachUiState.Ready(CoachFixtures.success(scenario.coachFixture))
        composeTestRule.setContent {
            MulsigyeTheme {
                MainScreen(status, forecast, coach, {}, {}, {})
            }
        }
    }

    @Test
    fun reducedMotionSnapsCountUpImmediately() {
        setReducedMotion(0f)
        composeTestRule.mainClock.autoAdvance = false
        setContentReadyMain(normal)
        // 클럭을 자동 진행하지 않는데도 reduced-motion에서는 snapTo로 즉시 목표값(84).
        composeTestRule.mainClock.advanceTimeByFrame()
        composeTestRule.onNodeWithText("84").assertIsDisplayed()
    }

    @Test
    fun motionEnabledAnimatesCountUpFromZero() {
        setReducedMotion(1f)
        composeTestRule.mainClock.autoAdvance = false
        setContentReadyMain(normal)
        // 모션 허용이면 카운트업이 0에서 시작하므로 첫 프레임에는 최종 값(84)이 아직 아니다.
        composeTestRule.mainClock.advanceTimeByFrame()
        composeTestRule.onNodeWithText("우리 지역 대표 저수지").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("84").assertCountEquals(0)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ⑤ DTO ↔ openapi 파싱 정합 — 프로덕션 직렬화기로 계약 픽스처를 디코드해 값 단언
    // (픽스처는 packages/contracts/examples와 byte 동일 — 단계 6 웹 교차검증 기반)
    // ─────────────────────────────────────────────────────────────────────────────

    @Test
    fun statusDtoParsesContractValues() {
        data class Expect(
            val fixture: String, val sigunCode: String, val sigunName: String,
            val rate: Double?, val avgRatio: Double, val stageCode: String, val highWater: Boolean,
        )
        listOf(
            Expect("status.normal.json", "44230", "논산시", 84.0, 103.0, "ok", false),
            Expect("status.watch.json", "46170", "나주시", 57.0, 68.0, "watch", false),
            Expect("status.severe.json", "50110", "제주시", 33.0, 46.0, "alert", false),
            Expect("status.flood.json", "26710", "기장군", 96.0, 118.0, "ok", true),
        ).forEach { e ->
            val dto = json.decodeFromString(StatusResponseDto.serializer(), Fixtures.read(e.fixture))
            assertEquals(e.fixture, e.sigunCode, dto.sigunCode)
            assertEquals(e.fixture, e.sigunName, dto.sigunName)
            assertEquals(e.fixture, e.rate, dto.reservoir.rate)
            assertEquals(e.fixture, e.avgRatio, dto.region.avgRatio, 0.0)
            assertEquals(e.fixture, e.stageCode, dto.region.officialStage.code)
            assertEquals(e.fixture, e.highWater, dto.highWaterNotice)
        }

        // stale: rate null·stale true·관측 기준일 보존.
        val stale = json.decodeFromString(StatusResponseDto.serializer(), Fixtures.read("status.stale.json"))
        assertNull(stale.reservoir.rate)
        assertTrue(stale.stale)
        assertEquals("2026-07-14", stale.region.observedOn)
    }

    @Test
    fun forecastDtoParsesReachAndModel() {
        val watchDto = json.decodeFromString(ForecastResponseDto.serializer(), Fixtures.read("forecast.watch.json"))
        assertEquals(18, watchDto.reach.days)
        assertEquals("care", watchDto.reach.targetStage?.code)
        assertEquals("주의", watchDto.reach.targetStage?.label)

        val severeDto = json.decodeFromString(ForecastResponseDto.serializer(), Fixtures.read("forecast.severe.json"))
        assertEquals(9, severeDto.reach.days)
        assertEquals("crit", severeDto.reach.targetStage?.code)
        assertEquals("심각", severeDto.reach.targetStage?.label)

        // 안정(도달 없음).
        val normalDto = json.decodeFromString(ForecastResponseDto.serializer(), Fixtures.read("forecast.normal.json"))
        assertNull(normalDto.reach.days)
        assertNull(normalDto.reach.targetStage)

        // MAE는 model 메타 실값(하드코딩 금지 회귀 방지).
        assertEquals(1.9168, watchDto.model.mae7, 0.0)
        assertEquals(2.8337, watchDto.model.mae14, 0.0)
        // 밴드는 forecast.low/high 그대로(임의 산식 없음).
        val firstBand = watchDto.forecast.first()
        assertEquals(67.5, firstBand.low, 0.0)
        assertEquals(68.2, firstBand.high, 0.0)
    }

    @Test
    fun coachDtoParsesStaticActions() {
        val dto = json.decodeFromString(CoachResponseDto.serializer(), Fixtures.read("coach.static.json"))
        assertEquals("static", dto.mode)
        assertEquals(3, dto.coach.actions.size)
        assertEquals("care_save_paddy_water", dto.coach.actions.first().id)
        assertFalse(dto.stale)

        val staleDto = json.decodeFromString(CoachResponseDto.serializer(), Fixtures.read("coach.stale.json"))
        assertTrue(staleDto.stale)
        assertEquals("static", staleDto.mode) // stale에서도 mode 표시 구조 동일.
    }
}
