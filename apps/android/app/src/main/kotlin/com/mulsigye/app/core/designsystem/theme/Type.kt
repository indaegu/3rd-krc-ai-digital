package com.mulsigye.app.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// 고령 농업인 대상: 본문 15sp 이상, 핵심 숫자 큰 글씨(design-system 접근성).
// Pretendard self-host는 후속 Task에서 연결하고, 지금은 시스템 고딕 폴백을 쓴다.
val MulsigyeTypography = Typography(
    displayLarge = TextStyle(
        fontSize = 48.sp,
        lineHeight = 56.sp,
        fontWeight = FontWeight.Bold,
    ),
    headlineLarge = TextStyle(
        fontSize = 28.sp,
        lineHeight = 36.sp,
        fontWeight = FontWeight.Bold,
    ),
    titleLarge = TextStyle(
        fontSize = 24.sp,
        lineHeight = 32.sp,
        fontWeight = FontWeight.Bold,
    ),
    titleMedium = TextStyle(
        fontSize = 18.sp,
        lineHeight = 26.sp,
        fontWeight = FontWeight.Bold,
    ),
    bodyLarge = TextStyle(
        fontSize = 17.sp,
        lineHeight = 26.sp,
    ),
    bodyMedium = TextStyle(
        fontSize = 15.sp,
        lineHeight = 23.sp,
    ),
    labelLarge = TextStyle(
        fontSize = 17.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.Bold,
    ),
    labelMedium = TextStyle(
        fontSize = 15.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.Medium,
    ),
)
