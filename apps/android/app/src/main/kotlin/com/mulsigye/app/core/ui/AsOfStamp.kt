package com.mulsigye.app.core.ui

import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

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

    /**
     * 통신이 끊겨 저장해 둔 값을 보여줄 때의 안내. cachedAt은 그 값을 받은 시각이다.
     *
     * "몇 시 기준"만 쓰면 방금 받은 값과 구분되지 않는다. 오늘 받은 값이면 시각을,
     * 하루 이상 지났으면 며칠 전인지를 앞세워 얼마나 오래된 정보인지 바로 알게 한다.
     */
    fun offlineText(cachedAt: Instant, now: Instant): String {
        val cachedDay = cachedAt.atZone(KST).toLocalDate()
        val today = now.atZone(KST).toLocalDate()
        val days = ChronoUnit.DAYS.between(cachedDay, today)
        val whenText = when {
            days <= 0L -> freshText(cachedAt).removeSuffix(" 기준")
            days == 1L -> "어제"
            else -> "${days}일 전"
        }
        return "$whenText 받은 정보예요 · 연결되면 새로 받아요"
    }
}
