package com.mulsigye.app.core.designsystem.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 순수 JVM 테스트. 공식 5단계(ok/watch/care/alert/crit)의 색 값·매핑이 design-system.md
 * 토큰과 정확히 일치하는지, 그리고 **글자 색(text)이 WCAG AA를 넘는지** 강제한다.
 *
 * 여기서는 색 값과 매핑만 검증한다. 임계값(70/60/50/40)이나 예측 산식은
 * 어떤 Android 코드에도 두지 않으므로(규칙 10) 이 테스트에도 없다.
 */
class StageColorsTest {
    @Test
    fun mapsEachStageCodeToDesignSystemColors() {
        assertEquals(
            StageColorSet(Color(0xFF2D83FF), Color(0xFF0064F5), Color(0xFFE8F3FF)),
            stageColorFor("ok"),
        )
        assertEquals(
            StageColorSet(Color(0xFF11C3C9), Color(0xFF0B7D81), Color(0xFFE7F9FA)),
            stageColorFor("watch"),
        )
        assertEquals(
            StageColorSet(Color(0xFFFFC94B), Color(0xFF966900), Color(0xFFFFF6E4)),
            stageColorFor("care"),
        )
        assertEquals(
            StageColorSet(Color(0xFFFF8032), Color(0xFFBF4900), Color(0xFFFFF0E6)),
            stageColorFor("alert"),
        )
        assertEquals(
            StageColorSet(Color(0xFFFC462D), Color(0xFFD71D03), Color(0xFFFFEBE8)),
            stageColorFor("crit"),
        )
    }

    @Test
    fun coversAllFiveOfficialStages() {
        val codes = listOf("ok", "watch", "care", "alert", "crit")
        val distinctForegrounds = codes.map { stageColorFor(it).fg }.toSet()
        assertEquals(5, distinctForegrounds.size)
    }

    /** WCAG 상대 휘도. */
    private fun luminance(color: Color): Double {
        fun channel(v: Float): Double {
            val c = v.toDouble()
            return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) +
            0.0722 * channel(color.blue)
    }

    private fun contrast(a: Color, b: Color): Double {
        val la = luminance(a)
        val lb = luminance(b)
        val hi = maxOf(la, lb)
        val lo = minOf(la, lb)
        return (hi + 0.05) / (lo + 0.05)
    }

    /**
     * 단계 **글자 색**은 흰 배경과 자기 틴트 배경 모두에서 본문 AA(4.5:1)를 넘어야 한다.
     * 시안 팔레트(fg)는 이 기준에 못 미쳐(주의 1.53:1) 글자에 쓸 수 없다 — 그래서 text가 있다.
     * 1차 타깃이 고령 농업인이므로 이 가드를 테스트로 고정한다.
     */
    @Test
    fun stageTextColorsMeetWcagAaOnWhiteAndTint() {
        for (code in listOf("ok", "watch", "care", "alert", "crit")) {
            val colors = stageColorFor(code)
            val onWhite = contrast(colors.text, Color(0xFFFFFFFF))
            val onTint = contrast(colors.text, colors.bg)
            assertEquals("$code: 흰 배경 대비 $onWhite", true, onWhite >= 4.5)
            assertEquals("$code: 틴트 배경 대비 $onTint", true, onTint >= 4.5)
        }
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
