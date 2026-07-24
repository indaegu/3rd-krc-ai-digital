package com.mulsigye.app.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.stageColorFor

/**
 * 공식 가뭄 단계 칩. 단색 tint 배경 + 단계명 + "지역 평년 대비 기준" 보조 라벨.
 *
 * - 단계 판정은 서버 값(`label`·`code`)을 그대로 표시하고 Android에서 재계산하지 않는다.
 * - 색만으로 단계를 구분하지 않도록 단계명·기준을 텍스트로 두고, 접근성 이름에도 함께 담는다.
 */
@Composable
fun StageChip(
    label: String,
    code: String,
    modifier: Modifier = Modifier,
    supportingLabel: String = "지역 평년 대비 기준",
) {
    val colors = stageColorFor(code)
    Column(
        modifier = modifier
            .semantics(mergeDescendants = true) {
                heading()
                contentDescription = "$supportingLabel, 현재 단계 $label"
            }
            .background(colors.bg, RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(
            text = label,
            color = colors.fg,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = supportingLabel,
            color = Ink3,
        )
    }
}
