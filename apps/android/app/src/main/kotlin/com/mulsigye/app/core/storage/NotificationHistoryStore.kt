package com.mulsigye.app.core.storage

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * 이 기기에서 실제로 보낸 알림 한 건. 계정·서버 동기화 없이 기기에만 남긴다.
 *
 * 주소 원문·검색어는 담지 않는다(알림 문구와 대표 지역 코드만). [receivedAt]은 epoch millis다.
 */
@Serializable
data class NotificationHistoryEntry(
    val title: String,
    val body: String,
    val receivedAt: Long,
    val sigunCode: String? = null,
)

/**
 * 알림 모아보기용 발송 기록 저장소. 워커가 알림을 보낼 때마다 한 건씩 남기고,
 * 화면은 최신순으로 읽는다. 최대 [MAX_ENTRIES]건만 유지한다(오래된 것부터 버린다).
 *
 * 알림 설정과 같은 DataStore 파일을 쓰되 키를 분리한다(파일을 늘리지 않는다).
 * 손상 JSON·형식 오류는 빈 목록으로 안전 초기화한다(RegionStore와 같은 규칙).
 */
class NotificationHistoryStore(
    private val dataStore: DataStore<Preferences>,
) {
    private val json = Json { ignoreUnknownKeys = true }

    /** 최신순 발송 기록. */
    val historyFlow: Flow<List<NotificationHistoryEntry>> =
        dataStore.data.map { prefs -> decode(prefs[KEY]) }

    suspend fun current(): List<NotificationHistoryEntry> = historyFlow.first()

    /** 발송 기록 한 건 추가(최신이 맨 앞). 오래된 기록은 [MAX_ENTRIES]까지만 남긴다. */
    suspend fun record(entry: NotificationHistoryEntry) = dataStore.edit { prefs ->
        val next = (listOf(entry) + decode(prefs[KEY])).take(MAX_ENTRIES)
        prefs[KEY] = json.encodeToString(next)
    }

    suspend fun clear() = dataStore.edit { it.remove(KEY) }

    private fun decode(raw: String?): List<NotificationHistoryEntry> {
        if (raw == null) return emptyList()
        return runCatching { json.decodeFromString<List<NotificationHistoryEntry>>(raw) }.getOrDefault(emptyList())
    }

    companion object {
        const val MAX_ENTRIES = 30
        private val KEY = stringPreferencesKey("notif_history_json")
    }
}
