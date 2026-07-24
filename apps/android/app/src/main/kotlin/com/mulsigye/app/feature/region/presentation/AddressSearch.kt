package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.region.domain.RegionCandidate

/**
 * 주소 검색 → 시군구 확정 → 우리 지역 대표 저수지 확인 → 등록 UI.
 *
 * 주소 원문·검색어는 화면 표시와 요청에만 쓰고 등록 후 어디에도 저장하지 않는다.
 * 카피는 product.md·웹 AddressSearch와 동일 문구다("가까운 저수지"·거리 금지).
 */
@Composable
fun AddressSearch(
    state: RegionAddUiState,
    onQueryChange: (String) -> Unit,
    onCandidateSelect: (RegionCandidate) -> Unit,
    onRetrySearch: () -> Unit,
    onRetryResolve: () -> Unit,
    onRegister: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(
                value = state.query,
                onValueChange = onQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("addressQueryField"),
                singleLine = true,
                label = { Text("도로명주소 검색") },
                placeholder = { Text("예) 시민로 210") },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    imeAction = ImeAction.Search,
                ),
            )
            Text(
                text = "도로명주소로 검색하면 우리 지역을 찾아드려요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ink3,
            )
        }

        when (val search = state.search) {
            is SearchPhase.Idle -> Unit

            is SearchPhase.Loading -> InlineSpinnerRow(text = "주소를 찾고 있어요…")

            is SearchPhase.Error -> RetryBox(
                message = search.message,
                retryable = search.retryable,
                onRetry = onRetrySearch,
            )

            is SearchPhase.Ready ->
                if (search.candidates.isEmpty()) {
                    Text(
                        text = "검색 결과가 없어요. 도로명주소를 다시 확인해 주세요.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink2,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        search.candidates.forEach { candidate ->
                            OutlinedButton(
                                onClick = { onCandidateSelect(candidate) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Text(
                                    text = candidate.label,
                                    modifier = Modifier.fillMaxWidth(),
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                            }
                        }
                    }
                }
        }

        when (val resolve = state.resolve) {
            is ResolvePhase.Idle -> Unit

            is ResolvePhase.Loading -> InlineSpinnerRow(text = "대표 저수지를 확인하고 있어요…")

            is ResolvePhase.Error -> RetryBox(
                message = resolve.message,
                retryable = resolve.retryable && state.selected != null,
                onRetry = onRetryResolve,
            )

            is ResolvePhase.Ready -> {
                val data = resolve.data
                val reservoir = data.reservoir
                if (data.prepared && reservoir != null) {
                    MulsigyeCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "이 주소로 등록할까요?",
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.semantics { heading() },
                        )
                        state.selected?.let {
                            Text(
                                text = it.label,
                                style = MaterialTheme.typography.bodyLarge,
                                color = Ink2,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }
                        Text(
                            text = "우리 지역 대표 저수지 · ${reservoir.name}",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                        CtaButton(
                            text = "등록하기",
                            onClick = onRegister,
                            busy = state.registering,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                } else {
                    MulsigyeCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "이 지역은 아직 준비 중이에요",
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(
                            text = "지금은 다른 주소로 등록해 주세요.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = Ink2,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        CtaButton(
                            text = "등록하기",
                            onClick = {},
                            enabled = false,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                }
            }
        }
    }
}

/** 인라인 스피너 + 안내 문구(풀스크린 스피너 대신 쓰는 로딩 패턴). */
@Composable
private fun InlineSpinnerRow(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        Spacer(Modifier.width(10.dp))
        Text(text = text, style = MaterialTheme.typography.bodyLarge, color = Ink2)
    }
}

/** 오류 문구 + (재시도 가능하면) 다시 시도 버튼. */
@Composable
private fun RetryBox(message: String, retryable: Boolean, onRetry: () -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = BlueTint, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = message, style = MaterialTheme.typography.bodyLarge)
            if (retryable) {
                TextButton(onClick = onRetry, modifier = Modifier.padding(top = 4.dp)) {
                    Text("다시 시도하기")
                }
            }
        }
    }
}
