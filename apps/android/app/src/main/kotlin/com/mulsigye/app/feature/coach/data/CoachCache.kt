package com.mulsigye.app.feature.coach.data

import com.mulsigye.app.feature.coach.domain.CoachResult

/**
 * 코치 성공 응답 단기 인메모리 캐시. 키=sigunCode, TTL=30분.
 *
 * - 반복 사용자 동작(메인↔상세 이동, 지역 왕복, 메인 재진입)에서 /api/v1/coach를 매번 다시
 *   부르지 않도록 성공 응답만 짧게 재사용한다. 코치는 ~시간 단위 데이터라 30분은 안전한 값이다.
 * - AppContainer가 들고 있어 ViewModel/화면보다 위에 살아 VM 재생성·리마운트에도 유지된다.
 * - 시간 소스는 주입 가능(clock)해 TTL 판정을 단위 테스트할 수 있다.
 * - 성공만 저장한다(오류는 여기에 오지 않는다 — 저장은 호출자 책임).
 */
class CoachCache(
    private val clock: () -> Long = System::currentTimeMillis,
    private val ttlMillis: Long = TTL_MILLIS,
) {
    private data class Entry(val response: CoachResult.Success, val fetchedAtMillis: Long)

    private val entries = mutableMapOf<String, Entry>()

    /** 만료되지 않은 캐시 성공이 있으면 반환, 없으면(또는 만료면) null. */
    @Synchronized
    fun get(sigunCode: String): CoachResult.Success? {
        val entry = entries[sigunCode] ?: return null
        if (clock() - entry.fetchedAtMillis >= ttlMillis) {
            entries.remove(sigunCode)
            return null
        }
        return entry.response
    }

    @Synchronized
    fun put(sigunCode: String, response: CoachResult.Success) {
        entries[sigunCode] = Entry(response, clock())
    }

    companion object {
        const val TTL_MILLIS: Long = 30 * 60 * 1000L
    }
}
