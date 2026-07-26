package com.mulsigye.app.core.designsystem.theme

import androidx.compose.ui.graphics.Color

// design-system.md 토큰의 Compose 이식. 이름을 번역해도 값·의미는 바꾸지 않는다.

// 잉크(텍스트)
val Ink = Color(0xFF191F28)
val Ink2 = Color(0xFF4E5968)
val Ink3 = Color(0xFF8B95A1)
val Ink4 = Color(0xFFB0B8C1)

// 배경·그레이
val Bg = Color(0xFFFFFFFF)
val Gray50 = Color(0xFFF9FAFB)

/** 카드·헤더 pill 표면 — 브랜드 그라디언트 위에 얹히므로 Gray50보다 흰색에 가깝다. */
val Surface = Color(0xFFFCFDFE)
val Gray100 = Color(0xFFF2F4F6)
val Gray200 = Color(0xFFE5E8EB)

// 블루(주 색) — 디자인 시안 기준 #2D83FF.
val Blue = Color(0xFF2D83FF)
val BlueDeep = Color(0xFF1F6FE6)
val BlueTint = Color(0xFFE8F3FF)
val BlueSoft = Color(0xFFD6E8FF)

// 브랜드 그라디언트 스톱(스플래시·온보딩·메인 헤더 배경). 시안: 시안→연블루→오프화이트.
val BrandGradientTop = Color(0xFFA6EEF9)
val BrandGradientMid = Color(0xFFC1E8FF)
val BrandGradientBottom = Color(0xFFF6F6F6)

// 공식 가뭄 단계 fg/bg (ok/watch/care/alert/crit — 의미·값 고정).
// 단계가 나빠질수록 파랑 → 청록 → 노랑 → 주황 → 빨강으로 넘어간다(디자인 지정).
val OkFg = Color(0xFF2D83FF)
val OkBg = Color(0xFFE8F3FF)
val WatchFg = Color(0xFF11C3C9)
val WatchBg = Color(0xFFE7F9FA)
val CareFg = Color(0xFFFFC94B)
val CareBg = Color(0xFFFFF6E4)
val AlertFg = Color(0xFFFF8032)
val AlertBg = Color(0xFFFFF0E6)
val CritFg = Color(0xFFFC462D)
val CritBg = Color(0xFFFFEBE8)
