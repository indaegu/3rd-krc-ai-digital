package com.mulsigye.app.core.designsystem.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 순수 JVM 테스트. 공식 5단계(ok/watch/care/alert/crit)의 fg/bg 값과 매핑이
 * design-system.md 토큰과 정확히 일치하는지 강제한다.
 *
 * 여기서는 색 값과 매핑만 검증한다. 임계값(70/60/50/40)이나 예측 산식은
 * 어떤 Android 코드에도 두지 않으므로(규칙 10) 이 테스트에도 없다.
 */
class StageColorsTest {
    @Test
    fun mapsEachStageCodeToDesignSystemColors() {
        assertEquals(StageColorSet(Color(0xFF159570), Color(0xFFE6F6F0)), stageColorFor("ok"))
        assertEquals(StageColorSet(Color(0xFF9A6700), Color(0xFFFFF3D6)), stageColorFor("watch"))
        assertEquals(StageColorSet(Color(0xFFD9510C), Color(0xFFFFEBDE)), stageColorFor("care"))
        assertEquals(StageColorSet(Color(0xFFE5372F), Color(0xFFFDEBEA)), stageColorFor("alert"))
        assertEquals(StageColorSet(Color(0xFFA11C1C), Color(0xFFF8E2E2)), stageColorFor("crit"))
    }

    @Test
    fun coversAllFiveOfficialStages() {
        val codes = listOf("ok", "watch", "care", "alert", "crit")
        val distinctForegrounds = codes.map { stageColorFor(it).fg }.toSet()
        assertEquals(5, distinctForegrounds.size)
    }

    @Test
    fun unknownCodeFallsBackToNeutralNotAStageColor() {
        val fallback = stageColorFor("unknown")
        val stageForegrounds = listOf("ok", "watch", "care", "alert", "crit")
            .map { stageColorFor(it).fg }
        // 알 수 없는 코드는 어떤 단계 색으로도 오인되지 않아야 한다.
        assertEquals(false, stageForegrounds.contains(fallback.fg))
    }
}
