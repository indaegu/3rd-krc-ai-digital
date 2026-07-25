package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.Shimmer
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray50
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.Ink4

/**
 * 등록 지역 목록 화면 — 선택 전환·순서 변경·삭제·빈 상태와 "수신호 시작하기" CTA.
 *
 * 순수 컴포저블(상태 + 콜백). 지역명·저수지명은 ViewModel이 status로 채운 [state]에서만
 * 읽고 저장소는 코드만 갖는다. 카피는 product.md·웹 RegionList와 동일 문구다.
 *
 * 레이아웃(#12): 헤더·"지역 추가하기"는 위에 고정, 지역 목록만 weight(1f)로 스크롤하고,
 * "수신호 시작하기" CTA는 하단에 고정한다(내비게이션 바 인셋 패딩 포함).
 */
@Composable
fun RegionListScreen(
    state: RegionListUiState,
    onSelectRegion: (Int) -> Unit,
    onRemoveRegion: (String) -> Unit,
    onMoveRegion: (Int, Int) -> Unit,
    onNavigateAdd: () -> Unit,
    onStart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize(),
    ) {
        // ── (a) 고정 헤더 + 지역 추가하기 ──────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "지역 설정",
                    style = MaterialTheme.typography.headlineLarge,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = "우리 지역을 등록하면 물 사정을 알려드려요.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
            }

            TextButton(onClick = onNavigateAdd) {
                Text("지역 추가하기", style = MaterialTheme.typography.labelLarge)
            }
        }

        // ── (b) 스크롤되는 지역 목록 영역 ─────────────────────────────────────────
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.items.isEmpty()) {
                EmptyRegions()
            } else {
                state.items.forEachIndexed { index, item ->
                    RegionRow(
                        item = item,
                        selected = index == state.currentIndex,
                        isPrimary = index == 0,
                        canMoveUp = index > 0,
                        canMoveDown = index < state.items.lastIndex,
                        onSelect = { onSelectRegion(index) },
                        onRemove = { onRemoveRegion(item.sigunCode) },
                        onMoveUp = { onMoveRegion(index, index - 1) },
                        onMoveDown = { onMoveRegion(index, index + 1) },
                    )
                }
            }
        }

        // ── (c) 하단 고정 CTA ────────────────────────────────────────────────────
        if (state.items.isNotEmpty()) {
            // 지역 이름을 아직 불러오는 중(스켈레톤)이면 시작을 막는다 — 확정 전 진입 방지.
            val resolving = state.items.any { it.name is RegionNameState.Loading }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 16.dp),
            ) {
                CtaButton(text = "수신호 시작하기", onClick = onStart, enabled = !resolving)
            }
        }
    }
}

@Composable
private fun EmptyRegions() {
    Surface(shape = RoundedCornerShape(24.dp), color = Gray50, modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "아직 등록한 지역이 없어요.",
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                text = "주소를 검색해서 우리 지역을 등록해 주세요.",
                style = MaterialTheme.typography.bodyLarge,
                color = Ink2,
            )
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
    selected: Boolean,
    isPrimary: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onSelect: () -> Unit,
    onRemove: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) {
    // 접근성 이름·이동 버튼 라벨에 쓸 표시 이름. 준비 전에는 코드로 대체한다.
    val displayName = when (val name = item.name) {
        is RegionNameState.Ready -> reservoirTitle(name.sigunName, name.reservoirName)
        else -> item.sigunCode
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier
                .weight(1f)
                .selectable(selected = selected, onClick = onSelect),
            shape = RoundedCornerShape(16.dp),
            color = if (selected) BlueTint else Gray50,
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (isPrimary) PrimaryBadge()
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
        }

        Spacer(Modifier.width(8.dp))

        // 위/아래 이동 화살표(#6) — 노약자 사용성 우선: 48dp 터치 타깃·명확한 접근성 이름.
        // 첫 행의 위로, 마지막 행의 아래로는 비활성(회색·클릭 불가)으로 둔다.
        Column(verticalArrangement = Arrangement.Center) {
            MoveButton(
                glyph = "▲",
                enabled = canMoveUp,
                contentDescription = "$displayName 위로 이동",
                onClick = onMoveUp,
            )
            MoveButton(
                glyph = "▼",
                enabled = canMoveDown,
                contentDescription = "$displayName 아래로 이동",
                onClick = onMoveDown,
            )
        }

        Spacer(Modifier.width(4.dp))

        Box(
            modifier = Modifier
                .size(48.dp)
                .clickable(onClick = onRemove)
                .semantics { contentDescription = "$displayName 삭제" },
            contentAlignment = Alignment.Center,
        ) {
            Text(text = "×", style = MaterialTheme.typography.titleLarge, color = Ink2)
        }
    }
}

/** index 0 = 대표 지역 표식(#7). 콜드 스타트 시 처음 보여줄 지역임을 나타낸다. */
@Composable
private fun PrimaryBadge() {
    Surface(shape = RoundedCornerShape(8.dp), color = Blue) {
        Text(
            text = "대표",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

/**
 * 순서 이동 버튼 하나. 48dp 터치 타깃. 비활성이면 클릭을 막고 색으로도 드러내며
 * TalkBack에는 disabled 상태로 읽힌다.
 */
@Composable
private fun MoveButton(
    glyph: String,
    enabled: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .then(
                if (enabled) {
                    Modifier
                        .clickable(onClick = onClick)
                        .semantics { this.contentDescription = contentDescription }
                } else {
                    Modifier.semantics {
                        this.contentDescription = contentDescription
                        disabled()
                    }
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = glyph,
            style = MaterialTheme.typography.titleMedium,
            color = if (enabled) Ink2 else Ink4,
        )
    }
}
