package com.mulsigye.app.feature.status.domain

/**
 * 공인 가뭄단계 표시 순서(정상→심각)의 Android 단일 출처.
 *
 * 값·의미는 서버 SSOT `apps/web/src/lib/data/drought-stage.ts`의 `STAGE_ORDER`와 동치다.
 * 여기서는 임계값 계산이나 단계 판정을 하지 않는다(AGENTS.md 규칙 5·10). 단계는 서버가
 * 확정하고 Android는 '표시 순서'만 안다. 서버가 status.stageBands로 순서를 함께 보내면
 * 그 순서를 우선 쓰고(런타임 출처), 구 페이로드로 없을 때만 이 상수로 폴백한다.
 */
val STAGE_ORDER: List<String> = listOf("ok", "watch", "care", "alert", "crit")

/** 단계 코드의 심각도 순위(작을수록 양호). 알 수 없는 코드는 -1. */
fun stageRank(code: String, order: List<String> = STAGE_ORDER): Int = order.indexOf(code)
