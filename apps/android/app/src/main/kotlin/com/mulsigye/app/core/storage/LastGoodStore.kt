package com.mulsigye.app.core.storage

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * 마지막으로 성공한 서버 응답 한 건.
 *
 * [payload]는 응답 DTO의 JSON 원문이다 — 도메인 객체가 아니라 원문을 두어야 나중에 매핑이
 * 바뀌어도 저장본을 다시 만들 필요가 없다. [savedAt]은 epoch millis(받은 시각)다.
 */
@Serializable
data class LastGoodEntry(
    val key: String,
    val payload: String,
    val savedAt: Long,
)

/**
 * 마지막 정상 응답 저장소 — 논밭에서 신호가 끊겨도 직전에 보던 화면을 그대로 보여주기 위한 것이다.
 *
 * 현장 사용자는 저수지 옆에서 앱을 여는 일이 많고 그곳이 대개 음영지역이다. 지금은 통신이
 * 끊기면 모든 카드가 오류로 바뀌어 "며칠째 몇 %였는지"조차 볼 수 없다. 그래서 성공 응답을
 * 기기에 남겨 두고, 재시도 가능한 실패(통신 두절·서버 일시 장애)일 때만 그 값을 되돌려준다.
 *
 * - [kind]는 모듈 구분(status·forecast), [key]는 조회 단위(시군코드 또는 "시군:시설")다.
 * - 종류별로 최신 [MAX_ENTRIES]건만 남긴다. 지역을 여러 개 등록해도 저장이 무한히 늘지 않는다.
 * - 저장하는 것은 공개 데이터 응답뿐이다. 주소 원문·검색어·좌표는 담기지 않는다.
 * - 손상 JSON·형식 오류는 "캐시 없음"으로 안전하게 떨어진다(RegionStore와 같은 규칙).
 */
class LastGoodStore(
    private val dataStore: DataStore<Preferences>,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val json = Json { ignoreUnknownKeys = true }

    /** 성공 응답을 저장한다. 같은 [key]의 이전 기록은 대체한다. */
    suspend fun save(kind: String, key: String, payload: String) {
        dataStore.edit { prefs ->
            val prefsKey = prefsKeyOf(kind)
            val kept = decode(prefs[prefsKey]).filterNot { it.key == key }
            val next = (listOf(LastGoodEntry(key, payload, clock())) + kept).take(MAX_ENTRIES)
            prefs[prefsKey] = json.encodeToString(next)
        }
    }

    /** 저장된 마지막 성공 응답. 없으면 null. */
    suspend fun load(kind: String, key: String): LastGoodEntry? =
        decode(dataStore.data.first()[prefsKeyOf(kind)]).firstOrNull { it.key == key }

    /** 저장본 전체 삭제(설정의 데이터 초기화에서 쓴다). */
    suspend fun clear() {
        dataStore.edit { prefs ->
            KINDS.forEach { prefs.remove(prefsKeyOf(it)) }
        }
    }

    private fun decode(raw: String?): List<LastGoodEntry> {
        if (raw == null) return emptyList()
        return runCatching {
            json.decodeFromString<List<LastGoodEntry>>(raw)
        }.getOrDefault(emptyList())
    }

    private fun prefsKeyOf(kind: String) = stringPreferencesKey("last_good_$kind")

    companion object {
        /** 종류별 보관 건수. 등록 지역 상한(5)보다 넉넉하되 저장이 커지지 않을 만큼만. */
        const val MAX_ENTRIES = 8

        const val KIND_STATUS = "status"
        const val KIND_FORECAST = "forecast"

        private val KINDS = listOf(KIND_STATUS, KIND_FORECAST)
    }
}
