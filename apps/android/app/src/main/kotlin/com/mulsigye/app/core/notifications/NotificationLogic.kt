package com.mulsigye.app.core.notifications

import com.mulsigye.app.core.storage.NotificationPrefsStore.Companion.MINUTES_PER_DAY
import com.mulsigye.app.feature.status.domain.STAGE_ORDER
import com.mulsigye.app.feature.status.domain.StatusResult
import com.mulsigye.app.feature.status.domain.stageRank

/**
 * 알림 결정·시각 계산·문구 조립의 순수 로직. 안드로이드 프레임워크 의존이 없어 JVM 단위 테스트로
 * 전부 검증한다(WorkManager·NotificationManager는 이 로직을 호출만 한다).
 *
 * 단계 판정·임계값은 여기서 만들지 않는다(규칙 5·10). 서버가 준 단계 코드/라벨/저수율만 쓴다.
 */
object NotificationLogic {

    /** 매일 알림 알림 제목. */
    const val DAILY_TITLE = "우리 지역 물 사정"

    /** 단계 악화 알림 제목. */
    const val STAGE_TITLE = "단계가 나빠졌어요"

    /**
     * 단계가 나빠졌는지 판단한다(옵트인 단계 알림).
     *
     * - [lastCode]가 null이면 기준선이 없으므로 알리지 않는다(켠 직후 첫 실행은 기준선만 세운다).
     * - 알 수 없는 현재/이전 코드는 알리지 않는다(오탐 방지).
     * - 순서 출처 [order]는 서버 stageBands에서 오면 그것을, 없으면 [STAGE_ORDER] 폴백을 넘긴다.
     *   함수 안에 순서를 하드코딩하지 않는다.
     */
    fun shouldNotifyStageWorsened(
        lastCode: String?,
        currentCode: String,
        order: List<String> = STAGE_ORDER,
    ): Boolean {
        if (lastCode == null) return false
        val currentRank = stageRank(currentCode, order)
        val lastRank = stageRank(lastCode, order)
        if (currentRank < 0 || lastRank < 0) return false
        return currentRank > lastRank
    }

    /**
     * 매일 알림의 초기 지연(분)을 계산한다. [nowMinutesOfDay]에서 오늘/내일의 [targetMinutesOfDay]까지
     * 남은 분. 목표가 지났거나 지금과 같으면 다음 날 같은 시각으로 잡는다(켜자마자 즉시 발송 방지).
     * 결과는 항상 1..1440(분). 정확 알람 권한을 쓰지 않으므로 근사 타이밍이면 충분하다.
     */
    fun dailyInitialDelayMinutes(nowMinutesOfDay: Int, targetMinutesOfDay: Int): Long {
        val now = ((nowMinutesOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
        val target = ((targetMinutesOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
        var delta = target - now
        if (delta <= 0) delta += MINUTES_PER_DAY
        return delta.toLong()
    }

    /** 자정부터의 분(0..1439)을 "오전/오후 h시 m분"으로 포맷한다(기기 로케일 무관·결정적). */
    fun formatDailyTime(minutes: Int): String {
        val clamped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
        val hour24 = clamped / 60
        val minute = clamped % 60
        val ampm = if (hour24 < 12) "오전" else "오후"
        val hour12 = when (val h = hour24 % 12) {
            0 -> 12
            else -> h
        }
        val mm = minute.toString().padStart(2, '0')
        return "$ampm ${hour12}시 ${mm}분"
    }

    /** 저수율 숫자를 정수면 소수점 없이, 아니면 소수 1자리로 포맷한다(TodayCard와 동일 규칙). */
    private fun formatRate(value: Double): String =
        if (value % 1.0 == 0.0) value.toLong().toString() else (Math.round(value * 10.0) / 10.0).toString()

    /**
     * 단계별 짧은 유용한 문구(~해요체). TodayCard 헤드라인과 같은 톤이며 예측을 단정하지 않는다.
     * 알 수 없는 코드는 중립 문구로 폴백한다.
     */
    fun usefulLineFor(stageCode: String): String = when (stageCode) {
        "ok" -> "물 사정이 넉넉해요"
        "watch" -> "물이 평소보다 조금 부족해요"
        "care" -> "물 부족이 이어지고 있어요"
        "alert" -> "물 부족이 빠르게 진행 중이에요"
        "crit" -> "물이 많이 부족한 상황이에요"
        else -> "물 사정을 확인해요"
    }

    /**
     * 매일 알림 본문. "지금 저수율 N% · {단계} · {짧은 유용한 문구}".
     * 저수율(reservoir.rate)이 없으면(지연 데이터) 저수율 조각을 빼고 단계·문구만 보여준다.
     */
    fun buildDailyText(status: StatusResult.Success): String {
        val stageLabel = status.region.officialStage.label
        val useful = usefulLineFor(status.region.officialStage.code)
        val rate = status.reservoir.rate
        val parts = buildList {
            if (rate != null) add("지금 저수율 ${formatRate(rate)}%")
            add(stageLabel)
            add(useful)
        }
        return parts.joinToString(" · ")
    }

    /** 단계 악화 알림 본문. 바뀐 단계와 확인 권유(~해요체). */
    fun buildStageWorsenedText(status: StatusResult.Success): String {
        val stageLabel = status.region.officialStage.label
        val useful = usefulLineFor(status.region.officialStage.code)
        return "지금 ‘$stageLabel’ 단계예요 · $useful · 물 사정을 확인해요"
    }
}
