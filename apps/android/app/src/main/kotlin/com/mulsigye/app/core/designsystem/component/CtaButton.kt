package com.mulsigye.app.core.designsystem.component

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink3

/**
 * 주 CTA. 높이 56dp, radius 16dp, `blue`, 글자 굵기 700, 비활성은 `gray200`(design-system).
 *
 * `busy = true` 이면 버튼 라벨을 감추고 흰 스피너만 보이며(중복 입력 잠금), 배경을 흐리게 해
 * "지금은 누를 수 없는 상태"임을 색으로도 드러낸다. TalkBack에는 "<라벨> 처리 중"으로 읽힌다.
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
            .height(56.dp)
            // 로딩 중에는 라벨을 감추므로 접근성 이름을 버튼에 직접 준다.
            .then(if (busy) Modifier.semantics { contentDescription = "$text 처리 중" } else Modifier),
        enabled = enabled,
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(
            // 로딩은 눌러도 반응하지 않으므로 배경을 흐리게 해 상태를 드러낸다.
            containerColor = if (busy) Blue.copy(alpha = 0.55f) else Blue,
            contentColor = Color.White,
            disabledContainerColor = Gray200,
            disabledContentColor = Ink3,
        ),
    ) {
        if (busy) {
            CircularProgressIndicator(
                // 장식 요소이므로 접근성 트리에서 제외한다(라벨은 버튼 contentDescription으로 읽힌다).
                modifier = Modifier
                    .size(22.dp)
                    .clearAndSetSemantics {},
                color = Color.White,
                strokeWidth = 2.dp,
            )
        } else {
            Text(text = text, fontWeight = FontWeight.Bold)
        }
    }
}
