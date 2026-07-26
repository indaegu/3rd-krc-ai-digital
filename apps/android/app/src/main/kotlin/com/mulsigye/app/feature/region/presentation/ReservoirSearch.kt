package com.mulsigye.app.feature.region.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.feature.region.domain.ReservoirHit

/**
 * 저수지 이름으로 지역을 찾는 인라인 UI — 주소를 몰라도 등록할 수 있는 길이다.
 *
 * 넓은 시군에서는 주소만으로 원하는 저수지가 잡히지 않는다(실측: 제주시 5곳).
 * 여기서 고른 저수지는 기기에 시설코드로 저장되고 status 조회에 함께 실려 유지된다.
 * 도로명주소 API를 부르지 않고 커밋 스냅샷만 조회하므로 주소 원문을 다루지 않는다.
 */
@Composable
fun ReservoirSearch(
    state: RegionAddUiState,
    onQueryChange: (String) -> Unit,
    onReservoirSelect: (ReservoirHit) -> Unit,
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
                value = state.reservoirQuery,
                onValueChange = onQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 60.dp)
                    .semantics { contentDescription = "저수지 이름 검색" }
                    .testTag("reservoirQueryField"),
                singleLine = true,
                placeholder = { Text("예) 탑정", color = Ink3) },
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
                text = "알고 있는 저수지 이름으로 찾아 바로 등록할 수 있어요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ink3,
            )
        }

        when (val search = state.reservoirSearch) {
            is ReservoirPhase.Idle -> Unit

            is ReservoirPhase.Loading -> InlineSpinnerRow(text = "저수지를 찾고 있어요…")

            is ReservoirPhase.Error -> RetryBox(
                message = search.message,
                retryable = search.retryable,
                onRetry = onRetrySearch,
            )

            is ReservoirPhase.Ready ->
                if (search.hits.isEmpty()) {
                    Text(
                        text = "찾는 저수지가 없어요. 이름을 다시 확인해 주세요.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink2,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        search.hits.forEach { hit ->
                            OutlinedButton(
                                onClick = {
                                    focusManager.clearFocus()
                                    onReservoirSelect(hit)
                                },
                                // 준비되지 않은 시군은 고를 수 없다 — 감추지 않고 이유를 보여준다.
                                enabled = hit.prepared,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Column(modifier = Modifier.fillMaxWidth()) {
                                    Text(
                                        text = hitTitle(hit),
                                        style = MaterialTheme.typography.bodyLarge,
                                    )
                                    Text(
                                        text = if (hit.prepared) {
                                            hit.address ?: ""
                                        } else {
                                            "이 지역은 아직 준비 중이에요"
                                        },
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Ink3,
                                    )
                                }
                            }
                        }
                    }
                }
        }
    }
}

/** "탑정 저수지 · 논산시" — 시군명이 없으면(준비 중) 이름만 쓴다. */
internal fun hitTitle(hit: ReservoirHit): String =
    if (hit.sigunName == null) {
        "${hit.name} 저수지"
    } else {
        "${hit.name} 저수지 · ${hit.sigunName}"
    }

/**
 * "이 저수지로 등록할까요?" 확인 팝업. 주소 경로의 ResolveConfirmOverlay와 같은 형태이며,
 * resolve를 거치지 않는다 — 검색 결과에 시군코드·시설코드·준비 여부가 이미 있다.
 */
@Composable
fun ReservoirConfirmOverlay(
    hit: ReservoirHit,
    registering: Boolean,
    onRegister: (setAsPrimary: Boolean) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var primaryChecked by rememberSaveable { mutableStateOf(true) }

    Box(modifier = modifier.fillMaxSize()) {
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
                Text(
                    text = "이 저수지로 등록할까요?",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.semantics { heading() },
                )
                hit.address?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink2,
                    )
                }
                Text(
                    text = "우리 지역 대표 저수지 · ${hit.name}",
                    style = MaterialTheme.typography.titleMedium,
                    color = Blue,
                )
                PrimaryAddressCheckRow(
                    checked = primaryChecked,
                    onToggle = { primaryChecked = !primaryChecked },
                )
                CtaButton(
                    text = "등록하기",
                    onClick = { onRegister(primaryChecked) },
                    busy = registering,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
