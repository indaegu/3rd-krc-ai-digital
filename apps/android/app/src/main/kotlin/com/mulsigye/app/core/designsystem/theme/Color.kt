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

// 공식 가뭄 단계 색 (ok/watch/care/alert/crit — 의미·값 고정).
// 단계가 나빠질수록 파랑 → 청록 → 노랑 → 주황 → 빨강으로 넘어간다(디자인 지정).
//
// **Fg는 그래픽 전용, Text는 글자 전용이다.** 시안 팔레트(Fg)는 물·차트처럼 큰 면적에는 좋지만
// 글자 색으로 쓰면 흰 배경 대비가 1.5~3.6:1로 WCAG AA(본문 4.5:1)에 크게 못 미친다
// (실측: 주의 1.53, 관심 2.17, 경계 2.50, 심각 3.47, 정상 3.62). 1차 타깃이 고령 농업인이라
// 읽히지 않으면 안 되므로 색조·채도는 그대로 두고 밝기만 낮춘 Text 토큰을 따로 둔다
// (흰 배경·틴트 배경 모두 4.5:1 이상). 단계 라벨·큰 숫자 등 모든 글자는 Text를 쓴다.
val OkFg = Color(0xFF2D83FF)
val OkText = Color(0xFF0064F5)
val OkBg = Color(0xFFE8F3FF)
val WatchFg = Color(0xFF11C3C9)
val WatchText = Color(0xFF0B7D81)
val WatchBg = Color(0xFFE7F9FA)
val CareFg = Color(0xFFFFC94B)
val CareText = Color(0xFF966900)
val CareBg = Color(0xFFFFF6E4)
val AlertFg = Color(0xFFFF8032)
val AlertText = Color(0xFFBF4900)
val AlertBg = Color(0xFFFFF0E6)
val CritFg = Color(0xFFFC462D)
val CritText = Color(0xFFD71D03)
val CritBg = Color(0xFFFFEBE8)
