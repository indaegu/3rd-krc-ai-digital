package com.mulsigye.app.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.mulsigye.app.R

// 고령 농업인 대상: 본문 15sp 이상, 핵심 숫자 큰 글씨(design-system 접근성).
// 디자인 시안 폰트 Pretendard를 self-host한다(웹 next/font와 동일). res/font의 정적 4굵기.
val Pretendard = FontFamily(
    Font(R.font.pretendard_regular, FontWeight.Normal),
    Font(R.font.pretendard_medium, FontWeight.Medium),
    Font(R.font.pretendard_semibold, FontWeight.SemiBold),
    Font(R.font.pretendard_bold, FontWeight.Bold),
)

val MulsigyeTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = Pretendard,
        fontSize = 48.sp,
        lineHeight = 56.sp,
        fontWeight = FontWeight.Bold,
    ),
    headlineLarge = TextStyle(
        fontFamily = Pretendard,
        fontSize = 25.sp,
        lineHeight = 36.sp,
        fontWeight = FontWeight.Bold,
    ),
    titleLarge = TextStyle(
        fontFamily = Pretendard,
        fontSize = 20.sp,
        lineHeight = 32.sp,
        fontWeight = FontWeight.Bold,
    ),
    titleMedium = TextStyle(
        fontFamily = Pretendard,
        fontSize = 18.sp,
        lineHeight = 26.sp,
        fontWeight = FontWeight.Bold,
    ),
    bodyLarge = TextStyle(
        fontFamily = Pretendard,
        fontSize = 17.sp,
        lineHeight = 26.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = Pretendard,
        fontSize = 15.sp,
        lineHeight = 23.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = Pretendard,
        fontSize = 17.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.Bold,
    ),
    labelMedium = TextStyle(
        fontFamily = Pretendard,
        fontSize = 15.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.Medium,
    ),
)
