package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.region.domain.RegionCandidate

// 확인 팝업 딤: 동의 시트와 동일 규정 딤(design-system) rgba(25,31,40,.45).
// 저수지 이름 등록 팝업(ReservoirConfirmOverlay)도 같은 딤을 쓴다.
internal val ConfirmScrim = Color(0x73191F28)

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
            // 시안(§10): 초점과 무관하게 파란 테두리 + 넉넉한 라운드, 안에는 입력 예시 플레이스홀더.
            // 떠오르는 라벨(label) 대신 접근성 이름을 semantics로 주어 시안의 깔끔한 한 줄을 지킨다.
            OutlinedTextField(
                value = state.query,
                onValueChange = onQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 60.dp)
                    .semantics { contentDescription = "도로명주소 검색" }
                    .testTag("addressQueryField"),
                singleLine = true,
                placeholder = { Text("예) 미래로 11", color = Ink3) },
                shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Blue,
                    unfocusedBorderColor = Blue,
                    focusedTextColor = Ink,
                    unfocusedTextColor = Ink,
                ),
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
    onRegister: (setAsPrimary: Boolean) -> Unit,
    onRetryResolve: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // "기본 주소지로 설정" 체크 상태(시안 §10). 기본 켜짐 — 끄면 이 지역을 대표로 승격하지 않는다.
    var primaryChecked by rememberSaveable { mutableStateOf(true) }

    Box(modifier = modifier.fillMaxSize()) {
        // 딤 — 탭하면 닫힌다(리플 없음).
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(ConfirmScrim)
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
                                // 시안 §10: 매칭된 대표 저수지를 파란 강조로 보여준다(저수지명은 서버값).
                                text = "우리 지역 대표 저수지 · ${reservoir.name}",
                                style = MaterialTheme.typography.titleMedium,
                                color = Blue,
                            )
                            // 기본 주소지(대표 지역) 설정 체크 — 시안 §10. 체크 상태를 등록에 전달한다:
                            // 켜짐이면 이 지역을 대표로, 끄면 이전 대표 지역을 유지한다(ViewModel.register).
                            PrimaryAddressCheckRow(checked = primaryChecked, onToggle = { primaryChecked = !primaryChecked })
                            CtaButton(
                                text = "등록하기",
                                onClick = { onRegister(primaryChecked) },
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

/**
 * "기본 주소지로 설정" 체크 행(시안 §10). 파란 체크 + 라벨. 터치 타깃 48dp, 상태를 접근성으로 알린다.
 */
@Composable
internal fun PrimaryAddressCheckRow(checked: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() })
            .semantics(mergeDescendants = true) {
                stateDescription = if (checked) "선택됨" else "선택 안 됨"
            }
            .sizeIn(minHeight = 48.dp)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // 체크 표시는 글꼴 글리프(✓) 대신 Canvas로 그린다 — 글리프는 baseline 때문에 사각형
        // 정중앙보다 아래로 치우쳐 보였다. 두 선분을 박스 가운데에 대칭으로 그려 정중앙에 맞춘다.
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (checked) Blue else Gray200)
                .clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            Canvas(modifier = Modifier.size(14.dp)) {
                val w = size.width
                val h = size.height
                val stroke = w * 0.19f
                val color = if (checked) Color.White else Ink3
                // ✓ 꺾은선: 왼쪽 중간 → 아래 꼭짓점 → 오른쪽 위. 세로로는 박스 중앙 기준 대칭.
                drawLine(
                    color = color,
                    start = Offset(w * 0.16f, h * 0.52f),
                    end = Offset(w * 0.42f, h * 0.78f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    color = color,
                    start = Offset(w * 0.42f, h * 0.78f),
                    end = Offset(w * 0.85f, h * 0.24f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = "기본 주소지로 설정",
            style = MaterialTheme.typography.bodyLarge,
            color = Ink,
        )
    }
}

/** 인라인 스피너 + 안내 문구(풀스크린 스피너 대신 쓰는 로딩 패턴). */
@Composable
internal fun InlineSpinnerRow(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        Spacer(Modifier.width(10.dp))
        Text(text = text, style = MaterialTheme.typography.bodyLarge, color = Ink2)
    }
}

/** 오류 문구 + (재시도 가능하면) 다시 시도 버튼. */
@Composable
internal fun RetryBox(message: String, retryable: Boolean, onRetry: () -> Unit) {
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
