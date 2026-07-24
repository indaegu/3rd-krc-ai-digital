package com.mulsigye.app.feature.status.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Ink2

/**
 * 만수위 '참고' 배너 — 서버가 확정한 highWaterNotice가 true일 때만 표시한다.
 *
 * - 클라이언트는 95%·상승 추세를 재판정하지 않는다(임계값 복제 금지·규칙 10).
 * - '경보/경고'라 부르지 않고, 홍수 안내는 공식 재난 문자로 위임한다(product.md).
 */
@Composable
fun HighWaterBanner(
    notice: Boolean,
    modifier: Modifier = Modifier,
) {
    if (!notice) {
        return
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(BlueTint, RoundedCornerShape(18.dp))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "참고",
            color = BlueDeep,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelMedium,
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = "최근 비로 저수율이 만수위에 가까워요. 방류·하류 안내는 공식 재난 문자를 확인해 주세요.",
            color = Ink2,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}
