package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.ForecastFixtures
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import org.junit.Rule
import org.junit.Test

/**
 * '이 추세라면' 도달 예상 모듈 렌더 검증. 도달일·대상 단계는 서버 reach 값을 그대로 쓰고,
 * MAE 캡션은 model 메타 실값을 표시한다(하드코딩 금지). 예측 단정 금지 표현 부재도 강제한다.
 */
class ReachCardTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setCard(fixture: String) {
        composeTestRule.setContent {
            MulsigyeTheme {
                ReachCard(forecast = ForecastFixtures.success(fixture))
            }
        }
    }

    @Test
    fun watchReachShowsDaysAndTargetStagePhrase() {
        setCard("forecast.watch.json")
        composeTestRule.onNodeWithText("18").assertIsDisplayed()
        composeTestRule
            .onNodeWithText("‘주의’ 단계에 들어설 가능성이 있어요", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun severeReachShowsCritStagePhrase() {
        setCard("forecast.severe.json")
        composeTestRule.onNodeWithText("9").assertIsDisplayed()
        composeTestRule
            .onNodeWithText("‘심각’ 단계에 들어설 가능성이 있어요", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun stableForecastShowsStableCopy() {
        setCard("forecast.stable.json")
        composeTestRule.onNodeWithText("안정").assertIsDisplayed()
        composeTestRule
            .onNodeWithText("당분간 물 사정이 안정적으로 유지될 것으로 보여요", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun normalForecastAlsoShowsStableCopy() {
        setCard("forecast.normal.json")
        composeTestRule.onNodeWithText("안정").assertIsDisplayed()
    }

    @Test
    fun forbiddenAssertivePhrasesAreAbsent() {
        setCard("forecast.severe.json")
        listOf("내려가요", "됩니다", "위험합니다", "경보", "경고").forEach { word ->
            composeTestRule.onAllNodesWithText(word, substring = true).assertCountEquals(0)
        }
    }

    @Test
    fun maeCaptionUsesModelValuesNotHardcoded() {
        // model MAE를 픽스처 기본값(1.9/2.8)과 다른 값으로 바꿔 캡션이 model에서만 나옴을 강제한다.
        val base = ForecastFixtures.success("forecast.watch.json")
        val custom: ForecastResult.Success = base.copy(
            model = base.model.copy(mae7 = 3.3, mae14 = 5.5),
        )
        composeTestRule.setContent {
            MulsigyeTheme {
                ReachCard(forecast = custom)
            }
        }
        composeTestRule.onNodeWithText("7일 ±3.3%p", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("14일 ±5.5%p", substring = true).assertIsDisplayed()
        // 픽스처 기본 MAE가 하드코딩돼 있지 않아야 한다.
        composeTestRule.onAllNodesWithText("1.9%p", substring = true).assertCountEquals(0)
        composeTestRule.onAllNodesWithText("2.8%p", substring = true).assertCountEquals(0)
    }
}
