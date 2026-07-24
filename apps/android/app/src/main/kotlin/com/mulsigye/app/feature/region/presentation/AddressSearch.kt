package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.region.domain.RegionCandidate

// 확인 팝업 딤: 동의 시트와 동일 규정 딤(design-system) rgba(25,31,40,.45).
private val Scrim = Color(0x73191F28)

/**
 * 주소 검색 → 시군구 확정 → 후보 목록 표시까지의 인라인 UI.
 *
 * 후보를 고르면 키보드를 내리고, 대표 저수지 확인·"이 주소로 등록할까요?"는 화면 위
 * [ResolveConfirmOverlay] 팝업으로 뜬다(여기서는 검색 결과까지만 그린다).
 * 주소 원문·검색어는 화면 표시와 요청에만 쓰고 등록 후 어디에도 저장하지 않는다.
 */
@Composable
fun AddressSearch(
    state: RegionAddUiState,
    onQueryChange: (String) -> Unit,
    onCandidateSelect: (RegionCandidate) -> Unit,
    onRetrySearch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current

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
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
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
                                onClick = {
                                    // 후보를 고르면 키보드를 내리고 확인 팝업을 띄운다.
                                    focusManager.clearFocus()
                                    onCandidateSelect(candidate)
                                },
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
    }
}

/**
 * "이 주소로 등록할까요?" 확인 팝업 — 화면 전체를 덮는 딤 + 하단 시트 카드.
 *
 * 후보 선택 후 대표 저수지 확인 단계(Loading/Ready/Error)를 담는다. 딤을 탭하거나
 * 뒤로가기로 [onDismiss]하면 검색 화면으로 돌아온다(검색 결과는 유지). 별도 창(Dialog)
 * 대신 같은 컴포지션 트리의 오버레이라 렌더 테스트가 그대로 동작한다.
 */
@Composable
fun ResolveConfirmOverlay(
    state: RegionAddUiState,
    onRegister: () -> Unit,
    onRetryResolve: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        // 딤 — 탭하면 닫힌다(리플 없음).
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Scrim)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                ),
        )

        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                // 카드 영역의 탭이 뒤 딤으로 새어 닫히지 않도록 소비한다.
                .pointerInput(Unit) { detectTapGestures {} },
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            color = Bg,
        ) {
            Column(
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
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
                                )
                            }
                            Text(
                                text = "우리 지역 대표 저수지 · ${reservoir.name}",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            CtaButton(
                                text = "등록하기",
                                onClick = onRegister,
                                busy = state.registering,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        } else {
                            Text(
                                text = "이 지역은 아직 준비 중이에요",
                                style = MaterialTheme.typography.titleLarge,
                                modifier = Modifier.semantics { heading() },
                            )
                            Text(
                                text = "지금은 다른 주소로 등록해 주세요.",
                                style = MaterialTheme.typography.bodyLarge,
                                color = Ink2,
                            )
                            CtaButton(
                                text = "등록하기",
                                onClick = {},
                                enabled = false,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
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
