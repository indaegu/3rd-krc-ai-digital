package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.Shimmer
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray50
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.Ink4
import kotlin.math.roundToInt

/** 목록 항목 사이 간격(dp). 드래그 목표 인덱스 계산 시 한 칸 높이에 이 간격을 더한다. */
private const val ROW_SPACING_DP = 12

/** 줄 끝 아이콘(삭제 X·추가 +)의 공통 터치 크기와 글리프 크기 — 두 줄의 아이콘을 같은 자리에 맞춘다. */
private val RowActionTouchSize = 48.dp
private val RowActionGlyphSize = 15.dp

/**
 * 누적 드래그량으로 목표 인덱스를 계산하는 순수 함수(테스트 대상).
 *
 * 항목 높이가 대체로 균일하다고 보고, 현재 끌고 있는 위치 [fromIndex]에서 누적 세로 이동량
 * [accumulatedDy]를 한 칸 높이 [itemHeightPx]로 나눠 반올림한 만큼 위/아래로 옮긴다.
 * 결과는 항상 [0, count-1] 범위로 clamp한다. 높이나 개수가 비정상이면 [fromIndex]를 유지한다.
 */
internal fun dragTargetIndex(
    fromIndex: Int,
    accumulatedDy: Float,
    itemHeightPx: Float,
    count: Int,
): Int {
    if (count <= 0) return 0
    if (itemHeightPx <= 0f) return fromIndex.coerceIn(0, count - 1)
    val steps = (accumulatedDy / itemHeightPx).roundToInt()
    return (fromIndex + steps).coerceIn(0, count - 1)
}

/**
 * 등록 지역 목록 화면 — 선택 전환·관리 모드(드래그 재정렬·다중 삭제)·빈 상태와 "시작하기" CTA.
 *
 * 순수 컴포저블(상태 + 콜백). 지역명·저수지명은 ViewModel이 status로 채운 [state]에서만
 * 읽고 저장소는 코드만 갖는다. 카피는 product.md·웹 RegionList와 동일 문구다.
 *
 * 순서 변경·다중 삭제·기본 주소지 지정은 관리 모드에서만 한다. 관리 모드는 한 줄을 길게 눌러
 * 켜고(일반 모드 상단에는 액션 버튼을 두지 않는다), 스크린리더는 각 줄의 "지역 관리" 커스텀
 * 액션으로 같은 진입을 한다. 드래그가 어려운 스크린리더 사용자를 위해 각 줄에 "위로/아래로
 * 이동" 커스텀 액션도 함께 둔다. 기본 주소지(대표)는 목록 맨 위(index 0)이며 관리 모드의
 * 별 아이콘으로 바꾼다.
 *
 * 레이아웃(#12): 헤더·상단 액션은 위에 고정, 지역 목록만 weight(1f)로 스크롤하고,
 * "시작하기" CTA는 하단에 고정한다(내비게이션 바 인셋 패딩 포함).
 */
@Composable
fun RegionListScreen(
    state: RegionListUiState,
    onSelectRegion: (Int) -> Unit,
    onRemoveRegion: (String) -> Unit,
    onMoveRegion: (Int, Int) -> Unit,
    onToggleManageMode: () -> Unit,
    onToggleSelection: (String) -> Unit,
    onDeleteSelected: () -> Unit,
    onSetPrimary: (String) -> Unit,
    onNavigateAdd: () -> Unit,
    onNavigateNotifications: () -> Unit,
    onStart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val manage = state.manageMode
    // 목록이 있거나 이미 관리 모드면 토글을 노출한다(관리 중 목록이 비어도 "완료"로 빠져나갈 수 있게).
    val showManageToggle = manage || state.items.isNotEmpty()

    var showDeleteConfirm by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxSize(),
    ) {
        // ── (a) 고정 헤더 + 상단 액션 ─────────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                // 상단이 상태바에 붙어 보이지 않게 여백을 넉넉히 준다.
                .padding(start = 20.dp, end = 20.dp, top = 32.dp, bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = if (manage) "지역 관리" else "우리 지역을 등록하면\n수신호를 알려드려요.",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        text = if (manage) {
                            "꾹 눌러 끌면 순서가 바뀌어요. 지울 지역을 골라 주세요."
                        } else {
                            "도로명 주소를 검색해서 우리 지역을 등록해 주세요."
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink2,
                    )
                }
                // 일반 모드에서는 상단 액션을 두지 않는다(화면을 비운다 — 알림 설정은 앱 환경설정에 있고,
                // 지역 관리는 줄을 길게 누르거나 각 줄의 접근성 액션 "지역 관리"로 들어간다).
                // 관리 모드에서만 삭제·완료 아이콘을 보여준다.
                if (manage) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val count = state.selected.size
                        HeaderIcon(
                            label = if (count > 0) "선택한 지역 삭제 ($count)" else "선택한 지역 삭제",
                            enabled = count > 0,
                            onClick = { if (count > 0) showDeleteConfirm = true },
                        ) { drawTrash(if (count > 0) Ink2 else Ink4) }
                        HeaderIcon(label = "지역 관리 완료", onClick = onToggleManageMode) { drawCheck(Blue) }
                    }
                }
            }
        }

        // ── (b) 스크롤되는 지역 목록 영역 ─────────────────────────────────────────
        RegionList(
            state = state,
            onSelectRegion = onSelectRegion,
            onRemoveRegion = onRemoveRegion,
            onMoveRegion = onMoveRegion,
            onToggleSelection = onToggleSelection,
            onSetPrimary = onSetPrimary,
            onEnterManageMode = { if (!manage) onToggleManageMode() },
            onNavigateAdd = onNavigateAdd,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        )

        // ── (c) 하단 고정 CTA(관리 모드에서는 감춘다 — 정리에 집중) ────────────────
        if (state.items.isNotEmpty() && !manage) {
            // 지역 이름을 아직 불러오는 중(스켈레톤)이면 시작을 막는다 — 확정 전 진입 방지.
            val resolving = state.items.any { it.name is RegionNameState.Loading }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 16.dp),
            ) {
                CtaButton(text = "시작하기", onClick = onStart, enabled = !resolving)
            }
        }
    }

    if (showDeleteConfirm) {
        val count = state.selected.size
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("${count}곳을 지울까요?") },
            text = { Text("고른 지역을 목록에서 지워요. 언제든 다시 추가할 수 있어요.") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteConfirm = false
                    onDeleteSelected()
                }) { Text("삭제") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("취소") }
            },
        )
    }
}

/**
 * 지역 목록 본문. 일반 모드는 탭으로 선택, 관리 모드는 체크박스 선택 + 손잡이 드래그 재정렬.
 *
 * 드래그는 [LazyColumn] + [detectDragGesturesAfterLongPress]로 구현한다. 손잡이를 길게 눌러
 * 끌면 누적 이동량을 한 칸 높이로 나눠 목표 인덱스를 정하고([dragTargetIndex]), 한 칸씩 넘길
 * 때마다 [onMoveRegion]으로 즉시 반영한다. 재배치는 [Modifier.animateItem]으로 부드럽게 흐른다.
 */
@Composable
private fun RegionList(
    state: RegionListUiState,
    onSelectRegion: (Int) -> Unit,
    onRemoveRegion: (String) -> Unit,
    onMoveRegion: (Int, Int) -> Unit,
    onToggleSelection: (String) -> Unit,
    onSetPrimary: (String) -> Unit,
    onEnterManageMode: () -> Unit,
    onNavigateAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (state.items.isEmpty()) {
        // 등록된 지역이 없으면 별도 안내 문구 없이 "지역 추가하기"만 보여준다(상단 안내가 이미 설명한다).
        Column(
            modifier = modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            AddRegionRow(onClick = onNavigateAdd)
        }
        return
    }

    val listState = rememberLazyListState()
    val density = LocalDensity.current
    val spacingPx = with(density) { ROW_SPACING_DP.dp.toPx() }

    // 드래그 상태: 지금 끌고 있는 항목의 현재 인덱스와 그 칸 원점 기준 누적 오프셋(px), 측정한 한 칸 높이.
    var draggingIndex by remember { mutableIntStateOf(-1) }
    var dragOffsetY by remember { mutableFloatStateOf(0f) }
    var rowHeightPx by remember { mutableFloatStateOf(0f) }

    LazyColumn(
        state = listState,
        modifier = modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(ROW_SPACING_DP.dp),
    ) {
        itemsIndexed(
            items = state.items,
            key = { _, item -> item.sigunCode },
        ) { index, item ->
            val isDragging = index == draggingIndex
            // 재정렬 중 index가 바뀌어도 손잡이 제스처가 끊기지 않도록, pointerInput 키는
            // 안정적인 sigunCode로 두고 최신 index는 rememberUpdatedState로 읽는다.
            val currentIndex by rememberUpdatedState(index)
            RegionRow(
                item = item,
                manage = state.manageMode,
                selected = if (state.manageMode) item.sigunCode in state.selected else index == state.currentIndex,
                isPrimary = index == 0,
                isFirst = index == 0,
                isLast = index == state.items.lastIndex,
                onSelect = { onSelectRegion(index) },
                onToggleSelection = { onToggleSelection(item.sigunCode) },
                onSetPrimary = { onSetPrimary(item.sigunCode) },
                onRemove = { onRemoveRegion(item.sigunCode) },
                onLongPress = onEnterManageMode,
                onMoveUp = { if (index > 0) onMoveRegion(index, index - 1) },
                onMoveDown = { if (index < state.items.lastIndex) onMoveRegion(index, index + 1) },
                dragHandleModifier = Modifier.pointerInput(item.sigunCode) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = {
                            draggingIndex = currentIndex
                            dragOffsetY = 0f
                        },
                        onDragEnd = {
                            draggingIndex = -1
                            dragOffsetY = 0f
                        },
                        onDragCancel = {
                            draggingIndex = -1
                            dragOffsetY = 0f
                        },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            if (draggingIndex < 0) return@detectDragGesturesAfterLongPress
                            dragOffsetY += dragAmount.y
                            val pitch = rowHeightPx + spacingPx
                            val target = dragTargetIndex(draggingIndex, dragOffsetY, pitch, state.items.size)
                            if (target != draggingIndex) {
                                onMoveRegion(draggingIndex, target)
                                // 오프셋을 새 칸 원점 기준으로 다시 맞춘다(넘긴 칸 수만큼 차감).
                                dragOffsetY -= (target - draggingIndex) * pitch
                                draggingIndex = target
                            }
                        },
                    )
                },
                modifier = Modifier
                    // 재배치는 튕기는 스프링 대신 짧은 tween으로 부드럽게 흐르게 한다.
                    .then(
                        if (isDragging) {
                            Modifier.zIndex(1f)
                        } else {
                            Modifier.animateItem(
                                fadeInSpec = null,
                                fadeOutSpec = null,
                                placementSpec = tween(durationMillis = 260, easing = FastOutSlowInEasing),
                            )
                        },
                    )
                    .graphicsLayer { if (isDragging) translationY = dragOffsetY }
                    .onSizeChanged { if (it.height > 0) rowHeightPx = it.height.toFloat() },
            )
        }

        // "지역 추가하기" 행 카드(시안 §9). 관리 모드에서는 정리에 집중하도록 감춘다.
        if (!state.manageMode) {
            item(key = "add-region-row") {
                AddRegionRow(onClick = onNavigateAdd)
            }
        }
    }
}

/** "지역 추가하기" 행 카드(+ 아이콘). 목록 아래에 두어 새 지역을 등록하는 진입점이다. */
@Composable
private fun AddRegionRow(onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = "지역 추가하기" },
        shape = RoundedCornerShape(12.dp),
        color = Gray50,
    ) {
        Row(
            modifier = Modifier
                .heightIn(min = 60.dp)
                .padding(start = 16.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "지역 추가하기",
                style = MaterialTheme.typography.titleMedium,
                color = Ink3,
                modifier = Modifier.weight(1f),
            )
            // 삭제 X와 같은 터치 크기·같은 오른쪽 위치에 두어 두 줄의 아이콘이 세로로 맞는다.
            Box(
                modifier = Modifier.size(RowActionTouchSize),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(modifier = Modifier.size(RowActionGlyphSize)) {
                    val s = size.width
                    val w = s * 0.16f
                    drawLine(Ink3, Offset(0f, s / 2f), Offset(s, s / 2f), strokeWidth = w, cap = StrokeCap.Round)
                    drawLine(Ink3, Offset(s / 2f, 0f), Offset(s / 2f, s), strokeWidth = w, cap = StrokeCap.Round)
                }
            }
        }
    }
}

/** 저수지명이 이미 "저수지"로 끝나면 중복해서 붙이지 않는다(#10). */
private fun reservoirTitle(sigunName: String, reservoirName: String): String {
    val suffixed = if (reservoirName.endsWith("저수지")) reservoirName else "$reservoirName 저수지"
    return "$sigunName $suffixed"
}

@Composable
private fun RegionRow(
    item: RegionListItem,
    manage: Boolean,
    selected: Boolean,
    isPrimary: Boolean,
    isFirst: Boolean,
    isLast: Boolean,
    onSelect: () -> Unit,
    onToggleSelection: () -> Unit,
    onSetPrimary: () -> Unit,
    onRemove: () -> Unit,
    onLongPress: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    dragHandleModifier: Modifier,
    modifier: Modifier = Modifier,
) {
    // 접근성 이름·이동 액션 라벨에 쓸 표시 이름. 준비 전에는 코드로 대체한다.
    val displayName = when (val name = item.name) {
        is RegionNameState.Ready -> reservoirTitle(name.sigunName, name.reservoirName)
        else -> item.sigunCode
    }

    // 시안(§9): 한 줄이 하나의 카드다. 삭제 X·드래그 손잡이도 카드 안에 넣고, 터치 영역만
    // 별도 48dp 버튼으로 분리한다(카드 탭 = 선택/토글, 아이콘 탭 = 그 아이콘의 동작).
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (manage) {
                    Modifier
                        .toggleable(
                            value = selected,
                            role = Role.Checkbox,
                            onValueChange = { onToggleSelection() },
                        )
                        .semantics {
                            contentDescription = displayName
                            customActions = buildList {
                                if (!isFirst) add(CustomAccessibilityAction("위로 이동") { onMoveUp(); true })
                                if (!isLast) add(CustomAccessibilityAction("아래로 이동") { onMoveDown(); true })
                            }
                        }
                } else {
                    Modifier
                        .selectable(selected = selected, onClick = onSelect)
                        .pointerInput(Unit) {
                            detectDragGesturesAfterLongPress(
                                onDragStart = { onLongPress() },
                                onDrag = { _, _ -> },
                            )
                        }
                        // 길게 누르기를 쓰기 어려운 스크린리더 사용자를 위한 관리 모드 진입 수단.
                        .semantics {
                            customActions = listOf(
                                CustomAccessibilityAction("지역 관리") { onLongPress(); true },
                            )
                        }
                },
            ),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) BlueTint else Gray50,
        // 배경 톤 차이만으로는 밝은 곳에서 구분이 약하다. 맨 위 줄의 "기본 주소지" 배지와
        // 함께 두 곳이 선택된 것처럼 읽히므로 테두리로 선택된 한 줄을 분명히 한다
        // (프로토타입 .region-row.sel · 웹 .itemCurrent와 같은 규격).
        border = if (selected) BorderStroke(1.6.dp, Blue) else null,
    ) {
        Row(
            modifier = Modifier
                // 관리 모드 행은 손잡이를 품어야 해서 조금 더 두껍게 둔다(얇아 보이지 않도록).
                .heightIn(min = if (manage) 68.dp else 60.dp)
                .padding(start = if (manage) 8.dp else 16.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (manage) {
                // 시각 표시만 담당(클릭은 카드 toggleable). 접근성 트리에서는 제외한다.
                Checkbox(checked = selected, onCheckedChange = null)
                Spacer(Modifier.width(4.dp))
            }
            // 이름 + (대표면) "기본 주소지" 작은 배지를 이름 오른쪽에 붙인다(시안).
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RegionName(item)
                if (isPrimary) {
                    Spacer(Modifier.width(8.dp))
                    PrimaryBadge()
                }
            }

            if (manage) {
                // 기본 주소지 지정 — 이 줄을 목록 맨 위(대표)로 올린다. 이미 대표면 채워진 별.
                Box(
                    modifier = Modifier
                        .size(RowActionTouchSize)
                        .clickable(enabled = !isPrimary, onClick = onSetPrimary)
                        .semantics {
                            contentDescription =
                                if (isPrimary) "$displayName 기본 주소지" else "$displayName 기본 주소지로 지정"
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(modifier = Modifier.size(19.dp)) {
                        drawStar(color = if (isPrimary) Blue else Ink4, filled = isPrimary)
                    }
                }
                // 드래그 손잡이 — 길게 눌러 끌면 순서가 바뀐다. 스크린리더는 위 커스텀 액션을 쓴다.
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .then(dragHandleModifier)
                        .semantics { contentDescription = "$displayName 순서 이동 손잡이" },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = "≡", style = MaterialTheme.typography.titleLarge, color = Ink3)
                }
            } else {
                Box(
                    modifier = Modifier
                        .size(RowActionTouchSize)
                        .clickable(onClick = onRemove)
                        .semantics { contentDescription = "$displayName 삭제" },
                    contentAlignment = Alignment.Center,
                ) {
                    // X와 아래 "+"는 같은 글리프 크기·같은 오른쪽 위치를 쓴다(줄 끝 정렬 통일).
                    Canvas(modifier = Modifier.size(RowActionGlyphSize)) {
                        val s = size.width
                        val w = s * 0.16f
                        drawLine(Ink2, Offset(0f, 0f), Offset(s, s), strokeWidth = w, cap = StrokeCap.Round)
                        drawLine(Ink2, Offset(s, 0f), Offset(0f, s), strokeWidth = w, cap = StrokeCap.Round)
                    }
                }
            }
        }
    }
}

/**
 * 헤더 아이콘 버튼 — 48dp 터치 목표 + 접근 가능한 이름. 아이콘은 코드베이스 관례대로 Canvas로 그린다.
 */
@Composable
private fun HeaderIcon(
    label: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    icon: DrawScope.() -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(22.dp).clearAndSetSemantics {}) { icon() }
    }
}

/** 완료(체크) 아이콘. */
private fun DrawScope.drawCheck(color: Color) {
    val w = size.width
    val h = size.height
    val stroke = w * 0.14f
    drawLine(color, Offset(w * 0.16f, h * 0.54f), Offset(w * 0.42f, h * 0.78f), strokeWidth = stroke, cap = StrokeCap.Round)
    drawLine(color, Offset(w * 0.42f, h * 0.78f), Offset(w * 0.86f, h * 0.24f), strokeWidth = stroke, cap = StrokeCap.Round)
}

/** 기본 주소지 별 아이콘. 채워진 별 = 현재 기본 주소지. */
private fun DrawScope.drawStar(color: Color, filled: Boolean) {
    val w = size.width
    val h = size.height
    val cx = w / 2f
    val cy = h * 0.54f
    val outer = w * 0.48f
    val inner = outer * 0.42f
    val path = Path()
    for (i in 0 until 10) {
        val r = if (i % 2 == 0) outer else inner
        val angle = Math.toRadians((-90 + i * 36).toDouble())
        val x = cx + (r * kotlin.math.cos(angle)).toFloat()
        val y = cy + (r * kotlin.math.sin(angle)).toFloat()
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    if (filled) {
        drawPath(path = path, color = color)
    } else {
        drawPath(path = path, color = color, style = Stroke(width = w * 0.1f))
    }
}

/** 선택 삭제(휴지통) 아이콘. */
private fun DrawScope.drawTrash(color: Color) {
    val w = size.width
    val h = size.height
    val stroke = w * 0.09f
    drawLine(color, Offset(w * 0.16f, h * 0.28f), Offset(w * 0.84f, h * 0.28f), strokeWidth = stroke, cap = StrokeCap.Round)
    drawLine(color, Offset(w * 0.4f, h * 0.28f), Offset(w * 0.4f, h * 0.18f), strokeWidth = stroke, cap = StrokeCap.Round)
    drawLine(color, Offset(w * 0.6f, h * 0.28f), Offset(w * 0.6f, h * 0.18f), strokeWidth = stroke, cap = StrokeCap.Round)
    drawLine(color, Offset(w * 0.4f, h * 0.18f), Offset(w * 0.6f, h * 0.18f), strokeWidth = stroke, cap = StrokeCap.Round)
    val body = Path().apply {
        moveTo(w * 0.24f, h * 0.28f)
        lineTo(w * 0.3f, h * 0.84f)
        lineTo(w * 0.7f, h * 0.84f)
        lineTo(w * 0.76f, h * 0.28f)
    }
    drawPath(path = body, color = color, style = Stroke(width = stroke))
}

/** 지역 한 줄의 이름 표시(로딩=스켈레톤, 준비=제목, 오류=코드+안내). */
@Composable
private fun RegionName(item: RegionListItem) {
    when (val name = item.name) {
        is RegionNameState.Loading -> {
            // 로드 후 레이아웃(제목 한 줄)과 같은 스켈레톤으로 자리 유지.
            Shimmer(modifier = Modifier.width(200.dp).height(22.dp))
        }

        is RegionNameState.Ready -> {
            Text(
                text = reservoirTitle(name.sigunName, name.reservoirName),
                style = MaterialTheme.typography.titleMedium,
            )
        }

        is RegionNameState.Error -> {
            Text(text = item.sigunCode, style = MaterialTheme.typography.titleMedium)
            Text(
                text = "지역 정보를 불러오지 못했어요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ink3,
            )
        }
    }
}

/**
 * index 0 = 대표 지역 표식(#7). 콜드 스타트 시 처음 보여줄 지역임을 나타낸다.
 * 시안(§9): "기본 주소지" — blue-tint 배경 + 파란 글자(색만이 아니라 텍스트로 의미 전달).
 */
@Composable
private fun PrimaryBadge() {
    // 배경은 흰색 — 선택된 행이 BlueTint라 같은 색이면 배지로 보이지 않는다(라벨 대비 확보).
    Surface(shape = RoundedCornerShape(6.dp), color = Bg) {
        Text(
            // 이름보다 한 단계 작은 글자(시안) — 이름 오른쪽에 붙어 보조 라벨로 읽힌다.
            text = "기본 주소지",
            style = MaterialTheme.typography.labelMedium,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Blue,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
        )
    }
}
