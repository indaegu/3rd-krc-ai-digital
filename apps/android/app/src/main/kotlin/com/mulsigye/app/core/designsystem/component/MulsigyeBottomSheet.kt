package com.mulsigye.app.core.designsystem.component

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Bg

// 바텀시트 딤: rgba(25,31,40,.45) (design-system).
private val SheetScrim = Color(0x73191F28)

/**
 * 공용 바텀시트: 상단 radius 24dp, 그랩바(기본 dragHandle), 규정 딤(design-system).
 *
 * `required = true` 이면 그랩바를 감춰 필수 시트임을 드러낸다. 딤/뒤로가기 닫기 차단은
 * 각 시트가 `onDismissRequest`에서 결정한다(예: 동의 시트는 무시).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MulsigyeBottomSheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(),
    required: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        modifier = modifier,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        containerColor = Bg,
        scrimColor = SheetScrim,
        dragHandle = if (required) null else { { BottomSheetDefaults.DragHandle() } },
        content = content,
    )
}
