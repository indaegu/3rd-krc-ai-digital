package com.mulsigye.app.core.storage

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * 옵트인 로컬 알림 설정. 계정·서버 동기화 없이 이 기기에만 저장한다.
 *
 * - [enabled]: 알림 마스터 스위치. 기본값 false(옵트인) — 켜기 전에는 아무 알림도 없다.
 * - [dailyTimeMinutes]: 매일 알림 시각(자정부터의 분, 0..1439). null이면 매일 알림 끔.
 * - [stageAlertEnabled]: 대표 지역 단계가 나빠지면 알려줄지. 기본값 true(단, master가 켜져야 동작).
 * - [lastNotifiedSigunCode]: 기준선이 어느 지역 것인지. 대표 지역이 바뀌면 단계 코드가 같아도
 *   다른 지역이므로 악화 판단을 하지 않는다(오탐 방지).
 * - [lastNotifiedStageCode]: 마지막으로 알린 단계 코드. 단계 악화 판단의 기준선(중복 알림 방지).
 */
data class NotificationPrefs(
    val enabled: Boolean = false,
    val dailyTimeMinutes: Int? = null,
    val stageAlertEnabled: Boolean = true,
    val lastNotifiedSigunCode: String? = null,
    val lastNotifiedStageCode: String? = null,
) {
    /** 실제로 스케줄할 일이 있는지(마스터 on + 매일 또는 단계 알림 중 하나 이상). */
    val hasActiveWork: Boolean
        get() = enabled && (dailyTimeMinutes != null || stageAlertEnabled)
}

/**
 * 알림 설정 저장소. RegionStore와 분리된 별도 Preferences DataStore를 쓴다
 * (지역 페이로드 직렬화에 알림 설정을 섞지 않는다). 키가 없으면 안전한 기본값으로 복원되어
 * 마이그레이션 없이도 구버전 설치에서 안전하다.
 */
class NotificationPrefsStore(
    private val dataStore: DataStore<Preferences>,
) {
    val prefsFlow: Flow<NotificationPrefs> = dataStore.data.map { prefs -> decode(prefs) }

    /** 워커 등 일회성 스냅샷이 필요한 곳에서 현재 값을 읽는다. */
    suspend fun current(): NotificationPrefs = prefsFlow.first()

    suspend fun setEnabled(enabled: Boolean) = dataStore.edit { it[ENABLED] = enabled }

    /** 매일 알림 시각(분). null이면 매일 알림을 끈다(키 삭제). 범위를 벗어나면 자른다. */
    suspend fun setDailyTimeMinutes(minutes: Int?) = dataStore.edit {
        if (minutes == null) it.remove(DAILY_TIME) else it[DAILY_TIME] = minutes.coerceIn(0, MINUTES_PER_DAY - 1)
    }

    suspend fun setStageAlertEnabled(enabled: Boolean) = dataStore.edit { it[STAGE_ALERT] = enabled }

    /**
     * 단계 알림 기준선 갱신 — 어느 지역(sigunCode)의 어느 단계(stageCode)까지 알렸는지 함께 저장한다.
     * 대표 지역이 바뀌면 이 지역 코드가 달라지므로 다음 실행에서 악화 판단을 건너뛰고 리셋만 한다.
     * 인자가 null이면 해당 키를 삭제한다.
     */
    suspend fun setLastNotified(sigunCode: String?, stageCode: String?) = dataStore.edit {
        if (sigunCode == null) it.remove(LAST_SIGUN) else it[LAST_SIGUN] = sigunCode
        if (stageCode == null) it.remove(LAST_STAGE) else it[LAST_STAGE] = stageCode
    }

    private fun decode(prefs: Preferences): NotificationPrefs = NotificationPrefs(
        enabled = prefs[ENABLED] ?: false,
        dailyTimeMinutes = prefs[DAILY_TIME]?.takeIf { it in 0 until MINUTES_PER_DAY },
        stageAlertEnabled = prefs[STAGE_ALERT] ?: true,
        lastNotifiedSigunCode = prefs[LAST_SIGUN],
        lastNotifiedStageCode = prefs[LAST_STAGE],
    )

    companion object {
        const val MINUTES_PER_DAY = 24 * 60
        private val ENABLED = booleanPreferencesKey("notif_enabled")
        private val DAILY_TIME = intPreferencesKey("notif_daily_time_minutes")
        private val STAGE_ALERT = booleanPreferencesKey("notif_stage_alert_enabled")
        private val LAST_SIGUN = stringPreferencesKey("notif_last_sigun_code")
        private val LAST_STAGE = stringPreferencesKey("notif_last_stage_code")
    }
}
