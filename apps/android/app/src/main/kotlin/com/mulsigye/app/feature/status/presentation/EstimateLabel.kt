package com.mulsigye.app.feature.status.presentation

import java.time.Instant
import java.time.ZoneId

/**
 * 추정값 기준일 표기 — 웹 `lib/client/estimate-label.ts`와 같은 규칙의 Android 구현.
 *
 * 추정은 커버리지를 채우는 가장 최근 날짜로 계산하므로 **오늘이 아닐 수 있다**. 그런데도 배지에
 * 늘 "오늘 추정"이라고 쓰면 며칠 지난 값을 오늘 값으로 읽게 된다(코드 리뷰 P1 지적).
 * 기준일이 서버 기준 오늘이 아니면 날짜를 그대로 드러낸다.
 *
 * 판단은 기기 시간대가 아니라 **서버 asOf**를 KST로 옮겨서 한다.
 */
private val KST: ZoneId = ZoneId.of("Asia/Seoul")

/** `YYYY-MM-DD` → "7월 26일". 고령 사용자 기준으로 슬래시 대신 한글 단위를 쓴다. */
internal fun koreanMonthDay(observedOn: String): String {
    val month = observedOn.drop(5).take(2).toIntOrNull()
    val day = observedOn.drop(8).take(2).toIntOrNull()
    if (month == null || day == null) return observedOn
    return "${month}월 ${day}일"
}

/** 추정 배지 문구. 기준일이 서버 기준 오늘이면 "오늘 추정", 아니면 "7월 24일 추정". */
fun estimateBadgeLabel(observedOn: String, asOf: Instant): String =
    if (observedOn == asOf.atZone(KST).toLocalDate().toString()) {
        "오늘 추정"
    } else {
        "${koreanMonthDay(observedOn)} 추정"
    }
