package com.mulsigye.app.core.notifications

import com.mulsigye.app.feature.status.domain.DroughtStage
import com.mulsigye.app.feature.status.domain.RegionStatus
import com.mulsigye.app.feature.status.domain.ReservoirStatus
import com.mulsigye.app.feature.status.domain.STAGE_ORDER
import com.mulsigye.app.feature.status.domain.StatusResult
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 알림 순수 로직 검증(프레임워크 없음): 단계 악화 판단·매일 시각→초기 지연·시각 포맷·문구 조립.
 * WorkManager/NotificationManager는 이 로직을 호출만 하므로 실제 발송은 여기서 검증하지 않는다.
 */
class NotificationLogicTest {

    // ── 단계 악화 판단 ─────────────────────────────────────────────────────────────

    @Test
    fun `기준선이 없으면(첫 실행) 알리지 않는다`() {
        assertFalse(NotificationLogic.shouldNotifyStageWorsened(lastCode = null, currentCode = "crit"))
    }

    @Test
    fun `단계가 나빠지면 알린다`() {
        assertTrue(NotificationLogic.shouldNotifyStageWorsened("ok", "watch"))
        assertTrue(NotificationLogic.shouldNotifyStageWorsened("watch", "care"))
        assertTrue(NotificationLogic.shouldNotifyStageWorsened("care", "alert"))
        assertTrue(NotificationLogic.shouldNotifyStageWorsened("alert", "crit"))
        assertTrue(NotificationLogic.shouldNotifyStageWorsened("ok", "crit"))
    }

    @Test
    fun `같거나 좋아지면 알리지 않는다`() {
        assertFalse(NotificationLogic.shouldNotifyStageWorsened("care", "care"))
        assertFalse(NotificationLogic.shouldNotifyStageWorsened("alert", "watch"))
        assertFalse(NotificationLogic.shouldNotifyStageWorsened("crit", "ok"))
    }

    @Test
    fun `알 수 없는 코드는 알리지 않는다`() {
        assertFalse(NotificationLogic.shouldNotifyStageWorsened("ok", "unknown"))
        assertFalse(NotificationLogic.shouldNotifyStageWorsened("unknown", "crit"))
    }

    @Test
    fun `순서 출처를 주입하면 그 순서로 판단한다(서버 stageBands 우선 재사용)`() {
        // 서버가 준 순서를 그대로 넘겨도 동일 판정(하드코딩 아님).
        val order = STAGE_ORDER
        assertTrue(NotificationLogic.shouldNotifyStageWorsened("watch", "alert", order))
        assertFalse(NotificationLogic.shouldNotifyStageWorsened("alert", "watch", order))
    }

    @Test
    fun `STAGE_ORDER는 정상에서 심각 순이다`() {
        assertEquals(listOf("ok", "watch", "care", "alert", "crit"), STAGE_ORDER)
    }

    // ── 매일 시각 → 초기 지연 ───────────────────────────────────────────────────────

    @Test
    fun `목표가 오늘 뒤면 남은 분을 돌려준다`() {
        // 08:00 지금, 목표 09:00 → 60분.
        assertEquals(60L, NotificationLogic.dailyInitialDelayMinutes(8 * 60, 9 * 60))
    }

    @Test
    fun `목표가 이미 지났으면 다음 날로 잡는다`() {
        // 10:00 지금, 목표 09:00 → 23시간(1380분).
        assertEquals(23L * 60L, NotificationLogic.dailyInitialDelayMinutes(10 * 60, 9 * 60))
    }

    @Test
    fun `목표가 지금과 같으면 다음 날 같은 시각으로 잡는다(즉시 발송 방지)`() {
        assertEquals(24L * 60L, NotificationLogic.dailyInitialDelayMinutes(8 * 60, 8 * 60))
    }

    @Test
    fun `자정 근처 경계도 안전하다`() {
        // 23:50 지금, 목표 00:10 → 20분.
        assertEquals(20L, NotificationLogic.dailyInitialDelayMinutes(23 * 60 + 50, 10))
        // 결과는 항상 1..1440.
        for (now in 0 until 1440 step 37) {
            for (target in 0 until 1440 step 53) {
                val d = NotificationLogic.dailyInitialDelayMinutes(now, target)
                assertTrue("delay in range for now=$now target=$target", d in 1L..1440L)
            }
        }
    }

    // ── 시각 포맷 ──────────────────────────────────────────────────────────────────

    @Test
    fun `시각을 오전_오후로 결정적으로 포맷한다`() {
        assertEquals("오전 12시 00분", NotificationLogic.formatDailyTime(0))
        assertEquals("오전 8시 00분", NotificationLogic.formatDailyTime(8 * 60))
        assertEquals("오전 8시 30분", NotificationLogic.formatDailyTime(8 * 60 + 30))
        assertEquals("오후 12시 00분", NotificationLogic.formatDailyTime(12 * 60))
        assertEquals("오후 6시 05분", NotificationLogic.formatDailyTime(18 * 60 + 5))
        assertEquals("오후 11시 50분", NotificationLogic.formatDailyTime(23 * 60 + 50))
    }

    // ── 문구 조립 ──────────────────────────────────────────────────────────────────

    @Test
    fun `매일 알림 본문은 저수율_단계_유용한 문구를 담는다`() {
        val text = NotificationLogic.buildDailyText(success(rate = 57.0, stageCode = "watch", stageLabel = "관심"))
        assertEquals("지금 저수율 57% · 관심 · 물이 평소보다 조금 부족해요", text)
    }

    @Test
    fun `저수율이 없으면(지연 데이터) 저수율 조각을 빼고 단계_문구만 보여준다`() {
        val text = NotificationLogic.buildDailyText(success(rate = null, stageCode = "care", stageLabel = "주의"))
        assertEquals("주의 · 물 부족이 이어지고 있어요", text)
    }

    @Test
    fun `소수 저수율은 소수 1자리로 포맷한다`() {
        val text = NotificationLogic.buildDailyText(success(rate = 57.4, stageCode = "ok", stageLabel = "정상"))
        assertTrue(text.startsWith("지금 저수율 57.4% · 정상 · "))
    }

    @Test
    fun `단계 악화 본문은 바뀐 단계와 확인 권유를 담는다`() {
        val text = NotificationLogic.buildStageWorsenedText(success(rate = 33.0, stageCode = "alert", stageLabel = "경계"))
        assertTrue(text.contains("‘경계’ 단계"))
        assertTrue(text.contains("물 사정을 확인해요"))
    }

    private fun success(rate: Double?, stageCode: String, stageLabel: String): StatusResult.Success =
        StatusResult.Success(
            sigunCode = "46170",
            sigunName = "나주시",
            reservoir = ReservoirStatus(
                facCode = "4617010200",
                name = "나주호",
                rate = rate,
                waterLevel = null,
                observedOn = "2026-07-20",
            ),
            region = RegionStatus(
                observedOn = "2026-07-20",
                regionalRate = null,
                normalRate = null,
                avgRatio = 68.0,
                officialStage = DroughtStage(code = stageCode, label = stageLabel),
            ),
            highWaterNotice = false,
            asOf = Instant.parse("2026-07-21T00:00:00.000Z"),
            sources = listOf("test"),
            stale = rate == null,
        )
}
