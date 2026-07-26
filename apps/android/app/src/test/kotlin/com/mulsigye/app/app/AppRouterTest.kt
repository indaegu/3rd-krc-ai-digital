package com.mulsigye.app.app

import com.mulsigye.app.core.storage.RegionStoreState
import com.mulsigye.app.core.storage.StoredRegion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 라우터 게이팅·백스택 로직 단위 검증. 순수 함수만 다뤄 기기·Compose 없이 결정적으로 돈다.
 *
 * - 게이팅 3분기는 웹 page.tsx 우선순위(동의 없음 최우선 → 지역 없음 → 둘 다)와 동일하다.
 * - BackHandler 실제 제스처는 Task 9 사람 QA. 여기선 pop·루트 종료 로직만 검증한다.
 */
class AppRouterTest {
    private val region = StoredRegion(sigunCode = "46170", facCode = "4517010")

    @Test
    fun `동의가 없으면 온보딩에서 시작한다`() {
        val store = RegionStoreState(consentVersion = null, regions = emptyList())
        assertEquals(Screen.Onboarding, startScreen(store))
    }

    @Test
    fun `동의는 있고 지역이 없으면 지역 설정에서 시작한다`() {
        val store = RegionStoreState(consentVersion = "consent-v1", regions = emptyList())
        assertEquals(Screen.Regions, startScreen(store))
    }

    @Test
    fun `동의와 지역이 모두 있으면 메인에서 시작한다`() {
        val store = RegionStoreState(consentVersion = "consent-v1", regions = listOf(region))
        assertEquals(Screen.Main, startScreen(store))
    }

    @Test
    fun `동의가 없으면 지역이 있어도 온보딩이 최우선이다`() {
        val store = RegionStoreState(consentVersion = null, regions = listOf(region))
        assertEquals(Screen.Onboarding, startScreen(store))
    }

    @Test
    fun `최초 사용자는 동의 후 지역 목록에 머문다`() {
        // consent 있음 + 지역 없음 → 지역 목록(Regions). 예전에는 주소 검색으로 자동 진입했지만
        // 갑작스러워서 없앴다. 목록의 "지역 추가하기"로 사용자가 직접 들어간다.
        val store = RegionStoreState(
            consentVersion = "consent-v1",
            regions = emptyList(),
            hasEverRegistered = false,
        )
        assertEquals(Screen.Regions, startScreen(store))
    }

    @Test
    fun `지역을 모두 지운 재방문 사용자도 지역 목록을 본다`() {
        val store = RegionStoreState(
            consentVersion = "consent-v1",
            regions = emptyList(),
            hasEverRegistered = true,
        )
        assertEquals(Screen.Regions, startScreen(store))
    }

    @Test
    fun `동의가 없고 지역 화면이면 뒤 콘텐츠를 블러한다`() {
        // 동의 시트가 자동으로 열리는 조건과 동일 → 뒤 콘텐츠 블러 활성.
        val store = RegionStoreState(consentVersion = null, regions = emptyList())
        assertEquals(true, shouldBlurBehindConsent(store, Screen.Regions))
    }

    @Test
    fun `동의를 마치면 지역 화면이라도 블러하지 않는다`() {
        val store = RegionStoreState(consentVersion = "consent-v1", regions = emptyList())
        assertEquals(false, shouldBlurBehindConsent(store, Screen.Regions))
    }

    @Test
    fun `동의가 없어도 지역 화면이 아니면 블러하지 않는다`() {
        // 시트는 Regions에서만 열리므로 다른 화면에선 뒤 블러가 붙지 않는다.
        val store = RegionStoreState(consentVersion = null, regions = emptyList())
        assertEquals(false, shouldBlurBehindConsent(store, Screen.Onboarding))
        assertEquals(false, shouldBlurBehindConsent(store, Screen.Main))
    }

    @Test
    fun `콜드 스타트는 지역이 있으면 대표(index 0)로 되돌린다`() {
        val store = RegionStoreState(
            consentVersion = "consent-v1",
            regions = listOf(region, region.copy(sigunCode = "44230")),
            currentIndex = 1,
        )
        assertEquals(true, shouldResetToPrimaryOnColdStart(store))
        assertEquals(0, PRIMARY_REGION_INDEX)
    }

    @Test
    fun `콜드 스타트는 지역이 없으면 되돌리지 않는다`() {
        val store = RegionStoreState(consentVersion = "consent-v1", regions = emptyList())
        assertEquals(false, shouldResetToPrimaryOnColdStart(store))
    }

    @Test
    fun `뒤로가기는 한 단계 pop 한다`() {
        val stack = listOf(Screen.Main, Screen.Trend)
        assertEquals(listOf(Screen.Main), popBackStack(stack))
    }

    @Test
    fun `루트에서 뒤로가기는 null(앱 종료)을 돌려준다`() {
        assertNull(popBackStack(listOf(Screen.Main)))
    }

    @Test
    fun `백스택 홀더 push_pop_replaceAll 이 일관되게 동작한다`() {
        val backStack = BackStack(listOf(Screen.Main))
        backStack.push(Screen.Trend)
        assertEquals(Screen.Trend, backStack.current)
        assertEquals(true, backStack.pop())
        assertEquals(Screen.Main, backStack.current)
        // 루트에서 pop 은 false(종료 신호)이며 스택은 유지된다.
        assertEquals(false, backStack.pop())
        assertEquals(Screen.Main, backStack.current)
        backStack.replaceAll(Screen.Regions)
        assertEquals(listOf(Screen.Regions), backStack.snapshot())
    }

    @Test
    fun `백스택 토큰 왕복이 폴리시 종류까지 보존된다`() {
        val stack = listOf<Screen>(
            Screen.Main,
            Screen.Regions,
            Screen.Policy(PolicyKind.PRIVACY),
        )
        val restored = stack.map { screenToToken(it) }.map { tokenToScreen(it) }
        assertEquals(stack, restored)
    }
}
