package com.mulsigye.app.feature.status.presentation

import com.mulsigye.app.core.designsystem.theme.stageColorFor
import com.mulsigye.app.feature.status.domain.StageBand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 게이지 순수 로직 검증(Canvas 없이). 채움 높이=평년 대비, 100 초과 만수 클램프, 단계 색 매핑,
 * stageBands 경계선 위치, stageBands 부재 시 눈금 없음을 강제한다. 임계값은 서버 stageBands에서만
 * 오므로(규칙 10) 여기에 70/60/50/40 상수를 두지 않고 입력 밴드로부터 파생만 검증한다.
 */
class ReservoirGaugeLogicTest {
    private val bands = listOf(
        StageBand("ok", "정상", 70.0),
        StageBand("watch", "관심", 60.0),
        StageBand("care", "주의", 50.0),
        StageBand("alert", "경계", 40.0),
        StageBand("crit", "심각", 0.0),
    )

    @Test
    fun fillReflectsAvgRatio() {
        assertEquals(93.7f, gaugeFillPercent(93.7), 0.0001f)
        assertEquals(0f, gaugeFillPercent(0.0), 0.0f)
    }

    @Test
    fun fillClampsOverfullToHundredAndNullToZero() {
        assertEquals(100f, gaugeFillPercent(140.1), 0.0f)
        assertEquals(0f, gaugeFillPercent(null), 0.0f)
    }

    @Test
    fun stageColorMatchesCurrentStage() {
        // 물 색 = 현재 단계 색(정상 초록 ≠ 심각 빨강).
        assertNotEquals(stageColorFor("ok").fg, stageColorFor("crit").fg)
        assertEquals(stageColorFor("alert").fg, stageColorFor("alert").fg)
    }

    @Test
    fun zoneLinesSitAtStageBoundariesFromServerBands() {
        // 70/60/50/40 경계만 선을 둔다(정상 100·심각 0은 통 테두리와 겹쳐 제외).
        // 위에서부터 y비율 = 1 - minRatio/100.
        assertEquals(listOf(0.3f, 0.4f, 0.5f, 0.6f), zoneLineFractionsFromTop(bands))
    }

    @Test
    fun noZoneLinesWhenStageBandsAbsent() {
        assertTrue(zoneLineFractionsFromTop(null).isEmpty())
        assertTrue(zoneLineFractionsFromTop(emptyList()).isEmpty())
    }
}
