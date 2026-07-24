package com.mulsigye.app.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.mulsigye.app.core.designsystem.theme.Ink3

/**
 * 모든 예측 화면 공통 면책 문구(규칙 3·product.md 카피 규칙). 웹과 동일 문장을 쓴다.
 * 예측이 참고임을 알리고 공식 가뭄 예·경보가 우선임을 병기한다.
 */
const val DISCLAIMER_TEXT = "예측은 참고용이며 공식 가뭄 예·경보가 우선이에요."

@Composable
fun Disclaimer(modifier: Modifier = Modifier) {
    Text(
        text = DISCLAIMER_TEXT,
        style = MaterialTheme.typography.bodyMedium,
        color = Ink3,
        modifier = modifier,
    )
}
