package com.mulsigye.app.core.ui

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * asOf(UTC ISO) → KST "오늘 오전/오후 h:mm 기준" 변환·지연 문구·로딩 문구를 검증한다.
 * 웹 formatAsOfStamp 규칙과 동일해야 한다(기기 시간대 무관, KST 고정 +9h·12시간제).
 */
class AsOfStampTest {
    @Test
    fun formatsUtcAsKstMorning() {
        // 00:00Z + 9h = 09:00 KST → 오전 9:00
        assertEquals(
            "오늘 오전 9:00 기준",
            AsOfStamp.freshText(Instant.parse("2026-07-21T00:00:00Z")),
        )
    }

    @Test
    fun formatsAfternoonWithTwelveHourClock() {
        // 05:30Z + 9h = 14:30 KST → 오후 2:30
        assertEquals(
            "오늘 오후 2:30 기준",
            AsOfStamp.freshText(Instant.parse("2026-07-21T05:30:00Z")),
        )
    }

    @Test
    fun formatsNoonBoundaryAsAfternoonTwelve() {
        // 03:00Z + 9h = 12:00 KST → 오후 12:00
        assertEquals(
            "오늘 오후 12:00 기준",
            AsOfStamp.freshText(Instant.parse("2026-07-21T03:00:00Z")),
        )
    }

    @Test
    fun formatsMidnightBoundaryAsMorningTwelve() {
        // 15:00Z + 9h = 00:00 KST(익일) → 오전 12:00
        assertEquals(
            "오늘 오전 12:00 기준",
            AsOfStamp.freshText(Instant.parse("2026-07-21T15:00:00Z")),
        )
    }

    @Test
    fun padsMinutesToTwoDigits() {
        // 00:05Z + 9h = 09:05 KST → 오전 9:05
        assertEquals(
            "오늘 오전 9:05 기준",
            AsOfStamp.freshText(Instant.parse("2026-07-21T00:05:00Z")),
        )
    }

    @Test
    fun delayedTextUsesObservedOn() {
        assertEquals(
            "2026-07-14 기준 · 지연된 정보예요",
            AsOfStamp.delayedText("2026-07-14"),
        )
    }

    @Test
    fun loadingTextMatchesSpec() {
        assertEquals("불러오는 중…", AsOfStamp.LOADING_TEXT)
    }
}
