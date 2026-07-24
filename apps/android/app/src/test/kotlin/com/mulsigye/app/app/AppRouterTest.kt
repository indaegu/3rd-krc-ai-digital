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
