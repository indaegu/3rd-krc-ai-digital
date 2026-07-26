package com.mulsigye.app.feature.region.presentation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.mulsigye.app.feature.region.domain.ReservoirHit
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import com.mulsigye.app.core.designsystem.theme.BlueDeep
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray100
import com.mulsigye.app.core.designsystem.theme.Ink3
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.feature.region.domain.RegionCandidate

/**
 * 지역 추가 화면 — 상단 뒤로가기 + 제목, 본문은 검색 방식 두 가지다.
 *   ① 주소로 찾기([AddressSearch]) — 도로명주소 → 시군 확정 → 대표 저수지 확인
 *   ② 저수지 이름으로 찾기([ReservoirSearch]) — 아는 이름으로 바로 등록
 * 넓은 시군에서는 주소만으로 원하는 저수지가 잡히지 않아(실측: 제주시 5곳) ②가 필요하다.
 *
 * 순수 컴포저블(상태 + 콜백)이라 Robolectric 단위 렌더가 가능하다. 네비게이션은
 * [onBack]·[onRegister] 콜백으로 위임한다(라우터는 Task 7).
 */
@Composable
fun RegionAddScreen(
    state: RegionAddUiState,
    onQueryChange: (String) -> Unit,
    onCandidateSelect: (RegionCandidate) -> Unit,
    onRetrySearch: () -> Unit,
    onRetryResolve: () -> Unit,
    onDismissResolve: () -> Unit,
    onRegister: (setAsPrimary: Boolean) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onReservoirQueryChange: (String) -> Unit = {},
    onReservoirSelect: (ReservoirHit) -> Unit = {},
    onRetryReservoirSearch: () -> Unit = {},
    onDismissReservoir: () -> Unit = {},
    onRegisterReservoir: (setAsPrimary: Boolean) -> Unit = {},
) {
    // 검색 방식 전환. 각 탭의 검색어·결과는 ViewModel에서 따로 들고 있어 옮겨도 유지된다.
    var byReservoir by rememberSaveable { mutableStateOf(false) }
    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier
                        .size(48.dp)
                        .semantics { contentDescription = "지역 설정으로 돌아가기" },
                ) {
                    Text(text = "←", style = MaterialTheme.typography.headlineLarge)
                }
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "지역 추가",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.semantics { heading() },
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SearchModeToggle(
                    label = "주소로 찾기",
                    selected = !byReservoir,
                    onClick = { byReservoir = false },
                )
                SearchModeToggle(
                    label = "저수지 이름으로 찾기",
                    selected = byReservoir,
                    onClick = { byReservoir = true },
                )
            }

            if (byReservoir) {
                ReservoirSearch(
                    state = state,
                    onQueryChange = onReservoirQueryChange,
                    onReservoirSelect = onReservoirSelect,
                    onRetrySearch = onRetryReservoirSearch,
                )
            } else {
                AddressSearch(
                    state = state,
                    onQueryChange = onQueryChange,
                    onCandidateSelect = onCandidateSelect,
                    onRetrySearch = onRetrySearch,
                )
            }
        }

        // 저수지 이름으로 고른 경우의 확인 팝업(resolve 없이 바로 등록).
        state.selectedReservoir?.let { hit ->
            BackHandler(enabled = true, onBack = onDismissReservoir)
            ReservoirConfirmOverlay(
                hit = hit,
                registering = state.registering,
                onRegister = onRegisterReservoir,
                onDismiss = onDismissReservoir,
            )
        }

        // 후보 확인(Loading/Ready/Error)은 화면 위 팝업으로 띄운다.
        if (state.resolve !is ResolvePhase.Idle) {
            // 팝업이 떠 있을 때 시스템 뒤로가기는 화면을 나가지 않고 팝업만 닫는다.
            // (라우터의 상시 BackHandler보다 안쪽에서 먼저 소비 — 잘못 고른 후보 취소 경로.)
            BackHandler(enabled = true, onBack = onDismissResolve)
            ResolveConfirmOverlay(
                state = state,
                onRegister = onRegister,
                onRetryResolve = onRetryResolve,
                onDismiss = onDismissResolve,
            )
        }
    }
}

/** 검색 방식 알약 버튼(주소 ↔ 저수지 이름). 선택된 쪽만 blue-tint로 강조한다. */
@Composable
private fun SearchModeToggle(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) BlueDeep else Ink3,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) BlueTint else Gray100)
            .clickable(onClick = onClick)
            .semantics { contentDescription = if (selected) "$label 선택됨" else label }
            .sizeIn(minHeight = 48.dp)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    )
}
