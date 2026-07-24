package com.mulsigye.app.feature.status.presentation

import android.content.Context
import android.provider.Settings
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.core.testing.StatusFixtures
import org.junit.Rule
import org.junit.Test

/**
 * 오늘 우리 저수지 모듈 렌더 검증(계약 픽스처 4상태). 두 저수율 분리 라벨·단계 칩·
 * 웹과 동일한 단계별 헤드라인·rate null 폴백·예측 단정 금지 표현 부재를 강제한다.
 */
class TodayCardTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setCard(fixture: String) {
        composeTestRule.setContent {
            MulsigyeTheme {
                TodayCard(status = StatusFixtures.success(fixture))
            }
        }
    }

    private fun setReducedMotion(scale: Float) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        Settings.Global.putFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            scale,
        )
    }

    @Test
    fun showsSeparatedLabels() {
        setCard("status.normal.json")
        composeTestRule.onNodeWithText("우리 지역 대표 저수지").assertIsDisplayed()
        composeTestRule.onNodeWithText("현재 저수율").assertIsDisplayed()
    }

    @Test
    fun normalStateShowsRateAvgStageAndHeadline() {
        setCard("status.normal.json")
        // 게이지·큰 숫자 = 대표 저수지 원저수율 rate(84%)
        composeTestRule.onNodeWithText("84", substring = true).assertIsDisplayed()
        // 단계 칩·보조 = 지역 평년 대비 avgRatio(103%)
        composeTestRule.onNodeWithText("지역 평년 대비 103%", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("정상", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("물 사정이 넉넉해요").assertIsDisplayed()
    }

    @Test
    fun watchStateShowsWatchHeadline() {
        setCard("status.watch.json")
        composeTestRule.onNodeWithText("57", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("지역 평년 대비 68%", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("관심", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("물이 평소보다 조금 부족해요").assertIsDisplayed()
    }

    @Test
    fun severeStateShowsAlertHeadline() {
        setCard("status.severe.json")
        composeTestRule.onNodeWithText("33", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("지역 평년 대비 46%", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("경계", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("물 부족이 빠르게 진행 중이에요").assertIsDisplayed()
    }

    @Test
    fun floodStateShowsHighWaterHeadline() {
        setCard("status.flood.json")
        composeTestRule.onNodeWithText("96", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("지역 평년 대비 118%", substring = true).assertIsDisplayed()
        // 만수위여도 헤드라인은 만수위 참고 문구를 쓴다(단계 칩은 여전히 공식 단계).
        composeTestRule.onNodeWithText("비가 많아 물은 충분해요").assertIsDisplayed()
    }

    @Test
    fun nullRateShowsObservationFallback() {
        setCard("status.stale.json")
        composeTestRule.onNodeWithText("관측값을 불러오지 못했어요").assertIsDisplayed()
    }

    @Test
    fun headlineHasNoForbiddenAssertivePhrases() {
        setCard("status.severe.json")
        // 예측을 사실로 단정하는 표현(product.md 카피 규칙)이 화면에 없어야 한다.
        listOf("위험", "내려가요", "됩니다", "경보", "경고").forEach { word ->
            composeTestRule
                .onAllNodesWithText(word, substring = true)
                .assertCountEquals(0)
        }
    }

    @Test
    fun countUpIsImmediateUnderReducedMotion() {
        setReducedMotion(0f)
        composeTestRule.mainClock.autoAdvance = false
        setCard("status.normal.json")
        // 클럭을 자동 진행하지 않으므로 카운트업이 살아 있다면 값이 0에 머문다.
        // reduced-motion에서는 snapTo로 즉시 목표값(84)이 되어야 한다.
        composeTestRule.mainClock.advanceTimeByFrame()
        composeTestRule.onNodeWithText("84", substring = true).assertIsDisplayed()
    }
}
