package com.mulsigye.app.core.storage

import com.mulsigye.app.core.testing.InMemoryPreferencesDataStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 알림 설정 DataStore 검증: 기본값(옵트인 꺼짐)·저장/복원·null 처리·기준선 코드.
 * 순수 인메모리 DataStore라 Robolectric 없이 결정적으로 돈다.
 */
class NotificationPrefsStoreTest {

    private fun store() = NotificationPrefsStore(InMemoryPreferencesDataStore())

    @Test
    fun `기본값은 옵트인 꺼짐이고 매일 시각은 없다`() = runTest {
        val prefs = store().current()
        assertFalse("기본은 꺼짐(옵트인)", prefs.enabled)
        assertNull("매일 시각 기본 없음", prefs.dailyTimeMinutes)
        assertTrue("단계 알림 기본 켜짐(단, 마스터가 켜져야 동작)", prefs.stageAlertEnabled)
        assertNull(prefs.lastNotifiedStageCode)
        assertFalse("아무 것도 안 켜졌으니 스케줄 없음", prefs.hasActiveWork)
    }

    @Test
    fun `켜고 매일 시각을 저장하면 복원된다`() = runTest {
        val s = store()
        s.setEnabled(true)
        s.setDailyTimeMinutes(8 * 60 + 30)
        val prefs = s.current()
        assertTrue(prefs.enabled)
        assertEquals(510, prefs.dailyTimeMinutes)
        assertTrue(prefs.hasActiveWork)
    }

    @Test
    fun `매일 시각 null이면 키를 지운다`() = runTest {
        val s = store()
        s.setDailyTimeMinutes(600)
        assertEquals(600, s.current().dailyTimeMinutes)
        s.setDailyTimeMinutes(null)
        assertNull(s.current().dailyTimeMinutes)
    }

    @Test
    fun `범위를 벗어난 시각은 잘라서 저장한다`() = runTest {
        val s = store()
        s.setDailyTimeMinutes(5000)
        assertEquals(NotificationPrefsStore.MINUTES_PER_DAY - 1, s.current().dailyTimeMinutes)
        s.setDailyTimeMinutes(-10)
        assertEquals(0, s.current().dailyTimeMinutes)
    }

    @Test
    fun `단계 기준선을 지역·단계와 함께 저장하고 지운다`() = runTest {
        val s = store()
        s.setLastNotified("46170", "care")
        assertEquals("46170", s.current().lastNotifiedSigunCode)
        assertEquals("care", s.current().lastNotifiedStageCode)
        s.setLastNotified(null, null)
        assertNull(s.current().lastNotifiedSigunCode)
        assertNull(s.current().lastNotifiedStageCode)
    }

    @Test
    fun `단계 알림만 켜도 스케줄 대상이다`() = runTest {
        val s = store()
        s.setEnabled(true)
        s.setStageAlertEnabled(true)
        s.setDailyTimeMinutes(null)
        val prefs = s.current()
        assertTrue("매일은 꺼도 단계 알림만으로 활성", prefs.hasActiveWork)
    }

    @Test
    fun `마스터가 꺼지면 하위 토글이 켜져 있어도 스케줄 없음`() = runTest {
        val s = store()
        s.setEnabled(false)
        s.setStageAlertEnabled(true)
        s.setDailyTimeMinutes(480)
        assertFalse(s.current().hasActiveWork)
    }
}
