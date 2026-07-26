package com.mulsigye.app.core.designsystem.theme

import androidx.compose.ui.graphics.Color

/**
 * 공식 가뭄 단계 색 묶음.
 *
 * @property fg 그래픽 전용(게이지 물·차트 면적). 시안 팔레트 그대로다.
 * @property text 글자 전용. fg는 흰 배경 대비가 WCAG AA에 못 미쳐(주의 1.53:1 등) 글자에
 *   쓸 수 없다. 색조·채도는 같고 밝기만 낮춰 흰 배경·틴트 모두 4.5:1 이상이다.
 * @property bg 옅은 틴트 배경(칩·배지).
 */
data class StageColorSet(val fg: Color, val text: Color, val bg: Color)

/**
 * 서버가 준 단계 코드 문자열을 design-system 토큰 색으로만 매핑한다.
 *
 * 여기서는 코드→색 매핑만 한다. **임계값(70/60/50/40)·avgRatio 판정·예측 산식은
 * 절대 두지 않는다**(AGENTS.md 규칙 5·10). 단계 판정은 서버가 하고 Android는 표시만 한다.
 * 알 수 없는 코드는 어떤 단계 색으로도 오인되지 않도록 중립색으로 폴백한다.
 */
fun stageColorFor(code: String): StageColorSet = when (code) {
    "ok" -> StageColorSet(OkFg, OkText, OkBg)
    "watch" -> StageColorSet(WatchFg, WatchText, WatchBg)
    "care" -> StageColorSet(CareFg, CareText, CareBg)
    "alert" -> StageColorSet(AlertFg, AlertText, AlertBg)
    "crit" -> StageColorSet(CritFg, CritText, CritBg)
    else -> StageColorSet(Ink2, Ink2, Gray100)
}
