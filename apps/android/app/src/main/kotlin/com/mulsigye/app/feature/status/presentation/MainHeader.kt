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
import com.mulsigye.app.core.designsystem.theme.Surface
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * 메인 헤더(시안 §3) — 좌측 대표 지역 드롭다운 + 우상단 아이콘 pill.
 *
 * - 좌: 대표 지역명(서버값) + 아래 chevron → 지역 설정/전환([onNavigateRegions]). 기준 시각은
 *   헤더 바로 아래 스탬프(MainScreen)가 소유한다.
 * - 우: 회색 pill 안에 [알림 모아보기]·구분선·[앱 환경설정] 두 아이콘(시안 §3). 이미 받은 알림을
 *   모아 보는 중립 진입이며 **알림 유도 배지/도트는 두지 않는다**(design-system 콘텐츠 가드).
 *   새로고침은 헤더 아래 기준시각을 눌러서 한다(당겨서 새로고침도 그대로).
 * - 배경 그라디언트는 화면 전체(MainScreen)가 소유한다 — 헤더는 따로 칠하지 않는다.
 * - 아이콘은 코드베이스 관례대로 Canvas로 직접 그린다. 단독 버튼에는 접근 가능한 이름을 주고,
 *   터치 목표는 48dp 이상으로 둔다.
 */
@Composable
fun MainHeader(
    regionLabel: String?,
    onNavigateRegions: () -> Unit,
    onNavigateNotificationInbox: () -> Unit,
    onNavigateAppSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp),
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

        // 우: [알림 모아보기] · 구분선 · [앱 환경설정] pill. 배지·도트 없이 중립 아이콘만.
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(15.dp))
                .background(Surface)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HeaderIconButton(label = "알림 모아보기", onClick = onNavigateNotificationInbox) { drawBell(Ink2) }
            Box(
                Modifier
                    .width(1.dp)
                    .height(18.dp)
                    .background(Gray200),
            )
            HeaderIconButton(label = "앱 환경설정", onClick = onNavigateAppSettings) { drawGear(Ink2) }
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
        // 22 → 24dp: 헤더 아이콘을 조금 더 크게(터치 목표 48dp는 그대로).
        Canvas(modifier = Modifier.size(24.dp).clearAndSetSemantics { }) { icon() }
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

/**
 * 알림 모아보기(벨) 아이콘. 배지·도트는 그리지 않는다(알림 유도 금지).
 *
 * 종전에는 캔버스의 0.15~0.88 구간만 써서 옆의 톱니(0.98까지 꽉 채움)보다 작아 보였다.
 * 두 아이콘이 같은 크기로 읽히도록 벨도 캔버스를 거의 꽉 채우고 선도 같이 굵혔다.
 */
private fun DrawScope.drawBell(color: Color) {
    val w = size.width
    val h = size.height
    val stroke = w * 0.11f
    val body = Path().apply {
        moveTo(w * 0.14f, h * 0.70f)
        lineTo(w * 0.86f, h * 0.70f)
        lineTo(w * 0.752f, h * 0.52f)
        lineTo(w * 0.752f, h * 0.35f)
        cubicTo(w * 0.752f, h * 0.08f, w * 0.248f, h * 0.08f, w * 0.248f, h * 0.35f)
        lineTo(w * 0.248f, h * 0.52f)
        close()
    }
    drawPath(path = body, color = color, style = Stroke(width = stroke, cap = StrokeCap.Round))
    // 종 아래 추(반원).
    drawArc(
        color = color,
        startAngle = 0f,
        sweepAngle = 180f,
        useCenter = false,
        topLeft = Offset(w * 0.38f, h * 0.66f),
        size = Size(w * 0.24f, h * 0.24f),
        style = Stroke(width = stroke, cap = StrokeCap.Round),
    )
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
