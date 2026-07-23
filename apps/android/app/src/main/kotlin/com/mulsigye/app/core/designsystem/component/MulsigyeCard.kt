package com.mulsigye.app.core.designsystem.component

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Gray50

/**
 * 메인 모듈 카드: `gray50` 단색, radius 24dp, 내부 패딩 20dp(design-system 레이아웃).
 */
@Composable
fun MulsigyeCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        color = Gray50,
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            content = content,
        )
    }
}
