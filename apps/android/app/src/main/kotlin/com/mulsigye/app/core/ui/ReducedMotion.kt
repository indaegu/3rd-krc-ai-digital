package com.mulsigye.app.core.ui

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * OS "애니메이션 삭제" 설정을 읽어 장식 모션을 끌지 판단한다.
 *
 * `Settings.Global.ANIMATOR_DURATION_SCALE == 0` 이면 사용자가 애니메이션을 껐다는 뜻이므로
 * 장식 모션(물 출렁임·rainfall·화면 전환)을 즉시 완료 상태로 렌더한다(design-system 애니메이션).
 * 값을 못 읽으면 기본 1(모션 켜짐)으로 본다.
 */
@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        val scale = Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        )
        scale == 0f
    }
}
