package com.mulsigye.app.core.designsystem.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * 브랜드 그라디언트 — 디자인 시안(스플래시·온보딩 전체 배경, 메인 헤더 상단).
 * 시안→연블루→오프화이트. 값의 SSOT는 [BrandGradientTop]/[BrandGradientMid]/[BrandGradientBottom].
 */
val BrandGradientColors: List<Color> = listOf(BrandGradientTop, BrandGradientMid, BrandGradientBottom)

/** 세로 브랜드 그라디언트 브러시(전체 배경용). 스플래시·온보딩 루트 Box/Column 배경에 쓴다. */
fun brandGradientBrush(): Brush = Brush.verticalGradient(BrandGradientColors)

/** 헤더 상단용 — 위는 연시안, 아래로 흰색으로 사라지는 그라디언트(본문 흰 배경과 이어짐). */
fun headerGradientBrush(): Brush =
    Brush.verticalGradient(listOf(BrandGradientTop, BrandGradientMid, Bg))
