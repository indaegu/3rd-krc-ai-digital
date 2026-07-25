package com.mulsigye.app.feature.status.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.headerGradientBrush
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * 메인 헤더(시안 §3) — 좌측 대표 지역 드롭다운 + 우상단 아이콘 pill.
 *
 * - 좌: 대표 지역명(서버값) + 아래 chevron → 지역 설정/전환([onNavigateRegions]). 기준 시각은
 *   헤더 바로 아래 스탬프(MainScreen)가 소유한다.
 * - 우: 회색 pill 안에 [새로고침]·구분선·[설정] 두 중립 아이콘. **알림 유도 배지/도트는 두지 않는다.**
 *   시안의 벨 자리는 새로고침으로 둔다 — 메인 화면에 알림 넛지를 두지 않는 콘텐츠 가드(design-system)를
 *   지키고, 별도 알림 설정 진입 콜백을 추가하면 화면 계약이 바뀌기 때문이다(설정=지역 설정 진입).
 * - 상단 브랜드 그라디언트가 헤더 뒤에 깔린다(위 연시안 → 아래 흰색).
 * - 아이콘은 코드베이스 관례대로 Canvas로 직접 그린다. 단독 버튼에는 접근 가능한 이름을 주고,
 *   터치 목표는 48dp 이상으로 둔다.
 */
@Composable
fun MainHeader(
    regionLabel: String?,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onNavigateRegions: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(headerGradientBrush())
            .padding(horizontal = 20.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // 좌: 대표 지역 드롭다운(지역 설정/전환).
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onNavigateRegions)
                .semantics(mergeDescendants = true) { contentDescription = "지역 설정" }
                .sizeIn(minHeight = 48.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = regionLabel ?: "우리 지역",
                style = MaterialTheme.typography.titleLarge,
                color = Ink,
            )
            Spacer(Modifier.width(4.dp))
            ChevronDown()
        }

        // 우: [새로고침] · 구분선 · [설정] pill. 중립 아이콘만(알림 배지/도트 금지).
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(15.dp))
                .background(Gray100)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HeaderIconButton(label = "새로고침", onClick = onRefresh) { drawRefresh(Ink2) }
            Box(
                Modifier
                    .width(1.dp)
                    .height(18.dp)
                    .background(Gray200),
            )
            HeaderIconButton(label = "지역 설정", onClick = onNavigateRegions) { drawGear(Ink2) }
        }
    }
}

@Composable
private fun HeaderIconButton(
    label: String,
    onClick: () -> Unit,
    icon: DrawScope.() -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = label }
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(22.dp).clearAndSetSemantics { }) { icon() }
    }
}

/** 지역 드롭다운 아래방향 chevron. 장식이라 접근성 트리에서 제외한다(이름은 부모 Row가 소유). */
@Composable
private fun ChevronDown() {
    Canvas(
        modifier = Modifier
            .size(18.dp)
            .clearAndSetSemantics { },
    ) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w * 0.25f, h * 0.4f)
            lineTo(w * 0.5f, h * 0.65f)
            lineTo(w * 0.75f, h * 0.4f)
        }
        drawPath(path = path, color = Ink, style = Stroke(width = w * 0.12f))
    }
}

/** 새로고침(원형 화살표) 아이콘. 위쪽에 틈을 두고 끝에 화살촉을 그린다. */
private fun DrawScope.drawRefresh(color: Color) {
    val cx = size.width / 2f
    val cy = size.height / 2f
    val r = min(size.width, size.height) / 2f * 0.66f
    val stroke = r * 0.34f
    // 원호(오른쪽 위에 틈).
    drawArc(
        color = color,
        startAngle = 50f,
        sweepAngle = 265f,
        useCenter = false,
        topLeft = Offset(cx - r, cy - r),
        size = Size(2f * r, 2f * r),
        style = Stroke(width = stroke, cap = StrokeCap.Round),
    )
    // 원호 끝(315°)에 화살촉 — 접선 바깥 방향을 가리키는 삼각형.
    val endRad = Math.toRadians(315.0)
    val ex = cx + (r * cos(endRad)).toFloat()
    val ey = cy + (r * sin(endRad)).toFloat()
    val a = r * 0.62f
    val head = Path().apply {
        moveTo(ex, ey - a)
        lineTo(ex + a, ey)
        lineTo(ex - a * 0.35f, ey + a * 0.45f)
        close()
    }
    drawPath(path = head, color = color)
}

/** 설정(톱니) 아이콘. 방사형 톱니 8개 + 몸통 링(가운데 구멍). */
private fun DrawScope.drawGear(color: Color) {
    val cx = size.width / 2f
    val cy = size.height / 2f
    val rOuter = min(size.width, size.height) / 2f * 0.98f
    val ringCenter = rOuter * 0.58f
    val ringStroke = rOuter * 0.30f
    val toothLen = rOuter * 0.30f
    val toothWidth = rOuter * 0.28f
    val teeth = 8
    for (i in 0 until teeth) {
        val ang = (2.0 * Math.PI / teeth) * i
        val sx = cx + (ringCenter * cos(ang)).toFloat()
        val sy = cy + (ringCenter * sin(ang)).toFloat()
        val ex = cx + ((ringCenter + toothLen) * cos(ang)).toFloat()
        val ey = cy + ((ringCenter + toothLen) * sin(ang)).toFloat()
        drawLine(
            color = color,
            start = Offset(sx, sy),
            end = Offset(ex, ey),
            strokeWidth = toothWidth,
            cap = StrokeCap.Round,
        )
    }
    // 몸통 링(스트로크가 가운데 구멍을 남긴다).
    drawCircle(
        color = color,
        radius = ringCenter,
        center = Offset(cx, cy),
        style = Stroke(width = ringStroke),
    )
}
