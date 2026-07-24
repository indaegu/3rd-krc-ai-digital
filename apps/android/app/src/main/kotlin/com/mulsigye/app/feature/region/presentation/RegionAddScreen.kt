package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.feature.region.domain.RegionCandidate

/**
 * 지역 추가 화면 — 상단 뒤로가기 + 제목, 본문은 [AddressSearch].
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
    onRegister: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
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
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.semantics { heading() },
            )
        }

        AddressSearch(
            state = state,
            onQueryChange = onQueryChange,
            onCandidateSelect = onCandidateSelect,
            onRetrySearch = onRetrySearch,
            onRetryResolve = onRetryResolve,
            onRegister = onRegister,
        )
    }
}
