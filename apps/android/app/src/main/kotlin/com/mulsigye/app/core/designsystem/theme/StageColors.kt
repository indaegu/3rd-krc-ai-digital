package com.mulsigye.app.core.designsystem.theme

import androidx.compose.ui.graphics.Color

/**
 * 공식 가뭄 단계 색 한 쌍(전경/배경).
 */
data class StageColorSet(val fg: Color, val bg: Color)

/**
 * 서버가 준 단계 코드 문자열을 design-system 토큰 색으로만 매핑한다.
 *
 * 여기서는 코드→색 매핑만 한다. **임계값(70/60/50/40)·avgRatio 판정·예측 산식은
 * 절대 두지 않는다**(AGENTS.md 규칙 5·10). 단계 판정은 서버가 하고 Android는 표시만 한다.
 * 알 수 없는 코드는 어떤 단계 색으로도 오인되지 않도록 중립색으로 폴백한다.
 */
fun stageColorFor(code: String): StageColorSet = when (code) {
    "ok" -> StageColorSet(OkFg, OkBg)
    "watch" -> StageColorSet(WatchFg, WatchBg)
    "care" -> StageColorSet(CareFg, CareBg)
    "alert" -> StageColorSet(AlertFg, AlertBg)
    "crit" -> StageColorSet(CritFg, CritBg)
    else -> StageColorSet(Ink2, Gray100)
}
