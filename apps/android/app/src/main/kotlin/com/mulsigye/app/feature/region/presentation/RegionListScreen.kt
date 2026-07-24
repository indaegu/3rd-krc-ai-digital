package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.Shimmer
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray50
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3

/**
 * 등록 지역 목록 화면 — 선택 전환·삭제·빈 상태와 "물시계 시작하기" CTA.
 *
 * 순수 컴포저블(상태 + 콜백). 지역명·저수지명은 ViewModel이 status로 채운 [state]에서만
 * 읽고 저장소는 코드만 갖는다. 카피는 product.md·웹 RegionList와 동일 문구다.
 */
@Composable
fun RegionListScreen(
    state: RegionListUiState,
    onSelectRegion: (Int) -> Unit,
    onRemoveRegion: (String) -> Unit,
    onNavigateAdd: () -> Unit,
    onStart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
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

        if (state.items.isEmpty()) {
            EmptyRegions()
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                state.items.forEachIndexed { index, item ->
                    RegionRow(
                        item = item,
                        selected = index == state.currentIndex,
                        onSelect = { onSelectRegion(index) },
                        onRemove = { onRemoveRegion(item.sigunCode) },
                    )
                }
            }
        }

        TextButton(onClick = onNavigateAdd) {
            Text("지역 추가하기", style = MaterialTheme.typography.labelLarge)
        }

        if (state.items.isNotEmpty()) {
            CtaButton(text = "물시계 시작하기", onClick = onStart)
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

@Composable
private fun RegionRow(
    item: RegionListItem,
    selected: Boolean,
    onSelect: () -> Unit,
    onRemove: () -> Unit,
) {
    val displayName = when (val name = item.name) {
        is RegionNameState.Ready -> name.sigunName
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
                when (val name = item.name) {
                    is RegionNameState.Loading ->
                        Shimmer(modifier = Modifier.width(140.dp).height(24.dp))

                    is RegionNameState.Ready -> {
                        Text(text = name.sigunName, style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = "우리 지역 대표 저수지 · ${name.reservoirName}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Ink3,
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
