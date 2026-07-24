package com.mulsigye.app.core.ui

import java.time.Instant
import java.time.ZoneId

/**
 * 기준 시각 스탬프 문안. 웹 `formatAsOfStamp`/`stampText` 규칙과 동일하다.
 *
 * - 정상: asOf(UTC ISO)를 KST(+9h)로 옮겨 "오늘 오전/오후 h:mm 기준"(12시간제).
 * - 지연(stale): 화면 구조는 그대로 두고 "{observedOn} 기준 · 지연된 정보예요"만 쓴다.
 * - 로딩: "불러오는 중…".
 *
 * 순수 함수만 두어 기기 시간대와 무관하게(KST 고정) 결정적으로 동작한다.
 */
object AsOfStamp {
    const val LOADING_TEXT: String = "불러오는 중…"

    private val KST: ZoneId = ZoneId.of("Asia/Seoul")

    /** asOf(UTC) → "오늘 오전/오후 h:mm 기준"(KST 고정). */
    fun freshText(asOf: Instant): String {
        val kst = asOf.atZone(KST)
        val hour24 = kst.hour
        val meridiem = if (hour24 < 12) "오전" else "오후"
        val clockHour = ((hour24 + 11) % 12) + 1
        val minutes = kst.minute.toString().padStart(2, '0')
        return "오늘 $meridiem $clockHour:$minutes 기준"
    }

    /** stale일 때의 지연 안내. observedOn은 관측 기준일(YYYY-MM-DD). */
    fun delayedText(observedOn: String): String = "$observedOn 기준 · 지연된 정보예요"
}
