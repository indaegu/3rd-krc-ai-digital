package com.mulsigye.app.core.designsystem.component

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Surface

/**
 * 메인 모듈 카드: 흰색, radius 12dp, 내부 패딩 20dp(디자인 시안 기준).
 */
@Composable
fun MulsigyeCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        // 카드는 항상 가로를 채운다. 종전에는 내용 폭을 따라가서, 고정 폭 Shimmer만 든
        // 스켈레톤 카드(이 추세라면)가 다른 카드보다 좁아 좌우가 어긋나 보였다.
        modifier = Modifier.fillMaxWidth().then(modifier),
        shape = RoundedCornerShape(12.dp),
        color = Surface,
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            content = content,
        )
    }
}
