package com.mulsigye.app.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import com.mulsigye.app.core.storage.RegionStoreState

/** 폴리시 문서 종류. 웹 `/policy/{location,terms,privacy}` 3종과 동치다. */
enum class PolicyKind { LOCATION, TERMS, PRIVACY }

/**
 * 상태 기반 라우터의 화면. Navigation 라이브러리 없이 sealed 계층으로만 표현한다
 * (tech-stack 금지 목록 준수). Splash는 게이팅 완료(동의+지역) 시 메인 위에 잠깐 덮는
 * 오버레이로 다루므로 백스택 항목으로는 쌓지 않지만, 토큰 왕복 완전성을 위해 계층에 둔다.
 */
sealed interface Screen {
    data object Splash : Screen
    data object Onboarding : Screen
    data object Regions : Screen
    data object RegionAdd : Screen
    data object Main : Screen
    data object Trend : Screen
    data object NotificationSettings : Screen
    data class Policy(val kind: PolicyKind) : Screen
}

/**
 * 게이팅: 저장소 상태로 시작 화면을 정한다. 웹 page.tsx 우선순위와 동일하다.
 * 동의 없음이 최우선(→ Onboarding), 그다음 지역 없음(→ Regions), 둘 다면 Main.
 * (둘 다일 때의 스플래시는 MulsigyeApp이 메인 위 오버레이로 1.5s 처리한다.)
 */
fun startScreen(store: RegionStoreState): Screen = when {
    store.consentVersion == null -> Screen.Onboarding
    store.regions.isEmpty() -> Screen.Regions
    else -> Screen.Main
}

/**
 * #1 최초 사용자 여부. 동의를 마쳤고(consent set) 등록 이력이 없으며(hasEverRegistered=false)
 * 지역이 비어 있으면 true → 빈 상태 대신 지역 검색(RegionAdd)으로 곧바로 보낸다.
 * 지역을 모두 지운 재방문 사용자(hasEverRegistered=true)는 false → 기존 빈 상태를 유지한다.
 */
fun shouldOpenFirstTimeSearch(store: RegionStoreState): Boolean =
    store.consentVersion != null && store.regions.isEmpty() && !store.hasEverRegistered

/**
 * #2 필수 동의 시트가 열려 있는 동안 뒤 콘텐츠를 실제 블러로 가릴지 결정한다. 조건은 동의 시트를
 * 자동으로 여는 [RegionsRoute]와 정확히 같다: 동의 미설정(consentVersion == null)이고 지역
 * 화면(Screen.Regions)일 때. 시트 자체는 별도 창(ModalBottomSheet)에 그려지므로 콘텐츠 Box에
 * 건 블러는 시트 내용에 닿지 않는다. Modifier.blur는 API 31+에서만 실제로 렌더되고 그 이하에선
 * 시트의 진한 스크림이 폴백으로 배경을 가린다(정적 효과라 reduced-motion 대상이 아니다).
 */
fun shouldBlurBehindConsent(store: RegionStoreState, current: Screen): Boolean =
    store.consentVersion == null && current == Screen.Regions

/**
 * #7 콜드 스타트 시 표시 지역을 대표(index 0)로 되돌릴지. 등록 지역이 있으면 true.
 * (세션 중 헤더로 바꾼 선택은 그대로 두고, 다음 콜드 스타트에서만 대표로 복귀한다.)
 */
fun shouldResetToPrimaryOnColdStart(store: RegionStoreState): Boolean =
    store.regions.isNotEmpty()

/** 대표 지역 인덱스. 목록 맨 위(0)를 대표로 본다(#7). */
const val PRIMARY_REGION_INDEX = 0

/**
 * 뒤로가기 한 단계. 루트(크기 1)면 null을 돌려 "앱 종료(finish)"를 알린다.
 * BackHandler·BackStack.pop 이 이 규칙을 공유한다.
 */
fun popBackStack(stack: List<Screen>): List<Screen>? =
    if (stack.size <= 1) null else stack.dropLast(1)

/** Screen → 저장 토큰. rememberSaveable 왕복과 프로세스 복원에 쓴다. */
fun screenToToken(screen: Screen): String = when (screen) {
    Screen.Splash -> "splash"
    Screen.Onboarding -> "onboarding"
    Screen.Regions -> "regions"
    Screen.RegionAdd -> "regionAdd"
    Screen.Main -> "main"
    Screen.Trend -> "trend"
    Screen.NotificationSettings -> "notificationSettings"
    is Screen.Policy -> "policy:${screen.kind.name}"
}

/** 저장 토큰 → Screen. 알 수 없는 토큰은 Main으로 안전 복원한다. */
fun tokenToScreen(token: String): Screen = when {
    token == "splash" -> Screen.Splash
    token == "onboarding" -> Screen.Onboarding
    token == "regions" -> Screen.Regions
    token == "regionAdd" -> Screen.RegionAdd
    token == "main" -> Screen.Main
    token == "trend" -> Screen.Trend
    token == "notificationSettings" -> Screen.NotificationSettings
    token.startsWith("policy:") ->
        Screen.Policy(runCatching { PolicyKind.valueOf(token.removePrefix("policy:")) }.getOrDefault(PolicyKind.TERMS))
    else -> Screen.Main
}

/**
 * 화면 백스택 홀더. Compose 스냅샷 리스트로 유지해 recomposition·프로세스 복원에 안전하다.
 *
 * - [pop]은 루트에서 false(앱 종료 신호)를 돌려주고 스택을 건드리지 않는다.
 * - [replaceAll]은 게이팅 완료(예: 지역 등록 후 메인 진입)처럼 이전 흐름을 지울 때 쓴다.
 */
class BackStack(initial: List<Screen>) {
    private val entries = mutableStateListOf<Screen>().apply {
        addAll(if (initial.isEmpty()) listOf(Screen.Main) else initial)
    }

    val current: Screen get() = entries.last()

    fun push(screen: Screen) {
        entries.add(screen)
    }

    /** 한 단계 pop. 루트면 false(종료 신호). */
    fun pop(): Boolean {
        if (entries.size <= 1) return false
        entries.removeAt(entries.lastIndex)
        return true
    }

    fun replaceAll(screen: Screen) {
        entries.clear()
        entries.add(screen)
    }

    fun snapshot(): List<Screen> = entries.toList()

    companion object {
        val Saver: Saver<BackStack, List<String>> = Saver(
            save = { it.snapshot().map(::screenToToken) },
            restore = { tokens -> BackStack(tokens.map(::tokenToScreen)) },
        )
    }
}

/** 시작 화면으로 초기화한 백스택을 기억한다(프로세스 재생성에도 유지). */
@Composable
fun rememberBackStack(initial: Screen): BackStack =
    rememberSaveable(saver = BackStack.Saver) { BackStack(listOf(initial)) }
