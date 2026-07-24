package com.mulsigye.app.core.designsystem.component

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink3

/**
 * 주 CTA. 높이 56dp, radius 16dp, `blue`, 글자 굵기 700, 비활성은 `gray200`(design-system).
 *
 * `busy = true` 이면 버튼 내부 흰 스피너를 보이고 클릭을 무시한다(중복 입력 잠금).
 * 버튼은 클릭 액션을 유지하되 콜백만 잠가, 등록·삭제 중복 요청을 막는다.
 */
@Composable
fun CtaButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    Button(
        onClick = { if (!busy) onClick() },
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp),
        enabled = enabled,
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Blue,
            contentColor = Color.White,
            disabledContainerColor = Gray200,
            disabledContentColor = Ink3,
        ),
    ) {
        if (busy) {
            CircularProgressIndicator(
                // 장식 요소이므로 접근성 트리에서 제외하고, 라벨은 버튼 텍스트로 읽게 둔다.
                modifier = Modifier
                    .size(20.dp)
                    .clearAndSetSemantics {},
                color = Color.White,
                strokeWidth = 2.dp,
            )
            Spacer(modifier = Modifier.width(8.dp))
        }
        Text(text = text, fontWeight = FontWeight.Bold)
    }
}
