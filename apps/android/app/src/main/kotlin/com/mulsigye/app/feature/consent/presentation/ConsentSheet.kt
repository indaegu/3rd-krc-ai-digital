package com.mulsigye.app.feature.consent.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.app.PolicyKind
import com.mulsigye.app.core.designsystem.component.CtaButton
import com.mulsigye.app.core.designsystem.component.MulsigyeBottomSheet
import com.mulsigye.app.core.designsystem.theme.Blue
import com.mulsigye.app.core.designsystem.theme.Gray200
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3

/** 동의 버전. 필수 2건을 모두 켜고 시작하면 이 값을 기기에 저장한다(웹 CONSENT_VERSION과 동일). */
const val CONSENT_VERSION = "consent-v1"

/** 필수 동의 항목. 각 항목은 해당 폴리시 문서로 이동하는 링크를 함께 둔다. */
private data class ConsentItem(
    val key: PolicyKind,
    val label: String,
    val linkLabel: String,
)

private val REQUIRED_ITEMS: List<ConsentItem> = listOf(
    ConsentItem(PolicyKind.LOCATION, "위치기반 서비스 이용 동의", "위치기반 서비스 약관 보기"),
    ConsentItem(PolicyKind.TERMS, "서비스 이용약관 동의", "서비스 이용약관 보기"),
)

/**
 * 동의 바텀시트 — 지역 설정 최초 진입 시(consentVersion 없을 때) 자동으로 열린다.
 *
 * 필수 동의라 딤·뒤로가기·스와이프로 닫히지 않는다([MulsigyeBottomSheet] required=true,
 * onDismissRequest 무시). 내용·상태는 [ConsentSheetContent]가 갖는다.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsentSheet(
    onAgree: () -> Unit,
    onOpenPolicy: (PolicyKind) -> Unit,
    modifier: Modifier = Modifier,
) {
    MulsigyeBottomSheet(
        // 필수 동의 — 딤/스와이프/뒤로가기로 닫히지 않도록 dismiss 요청을 무시한다.
        onDismissRequest = {},
        required = true,
        modifier = modifier,
    ) {
        ConsentSheetContent(onAgree = onAgree, onOpenPolicy = onOpenPolicy)
    }
}

/**
 * 동의 시트 내용(순수 컴포저블·상태 소유). 바텀시트와 분리해 단위 렌더 테스트가 쉽다.
 *
 * - 필수 2건을 모두 켜야 "동의하고 시작하기"가 활성화된다.
 * - "모두 동의합니다"는 두 항목을 한 번에 켜고 끈다.
 * - 각 항목의 "보기"는 [onOpenPolicy]로 해당 폴리시로 이동한다(주소 미저장 안내는 시트에도 노출).
 */
@Composable
fun ConsentSheetContent(
    onAgree: () -> Unit,
    onOpenPolicy: (PolicyKind) -> Unit,
    modifier: Modifier = Modifier,
) {
    val checks = remember { mutableStateMapOf(PolicyKind.LOCATION to false, PolicyKind.TERMS to false) }
    val allChecked = REQUIRED_ITEMS.all { checks[it.key] == true }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 24.dp, end = 24.dp, bottom = 24.dp, top = 8.dp),
    ) {
        Text(
            text = "물시계를 시작하려면 동의가 필요해요",
            style = MaterialTheme.typography.headlineLarge,
            color = Ink,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "주소는 시군구와 대표 저수지를 정한 뒤에는 저장하지 않아요.",
            style = MaterialTheme.typography.bodyLarge,
            color = Ink2,
        )
        Spacer(Modifier.height(20.dp))

        // 모두 동의합니다.
        CheckRow(
            label = "모두 동의합니다",
            checked = allChecked,
            emphasize = true,
            onToggle = {
                val next = !allChecked
                REQUIRED_ITEMS.forEach { checks[it.key] = next }
            },
        )

        Spacer(Modifier.height(4.dp))
        REQUIRED_ITEMS.forEach { item ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                CheckRow(
                    label = item.label,
                    checked = checks[item.key] == true,
                    required = true,
                    modifier = Modifier.weight(1f),
                    onToggle = { checks[item.key] = !(checks[item.key] ?: false) },
                )
                PolicyLink(label = item.linkLabel, onClick = { onOpenPolicy(item.key) })
            }
        }

        Spacer(Modifier.height(8.dp))
        PolicyLink(
            label = "개인정보 처리방침 보기",
            onClick = { onOpenPolicy(PolicyKind.PRIVACY) },
            modifier = Modifier.padding(start = 4.dp),
        )

        Spacer(Modifier.height(20.dp))
        CtaButton(
            text = "동의하고 시작하기",
            enabled = allChecked,
            onClick = { if (allChecked) onAgree() },
        )
    }
}

@Composable
private fun CheckRow(
    label: String,
    checked: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    required: Boolean = false,
    emphasize: Boolean = false,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onToggle)
            .semantics(mergeDescendants = true) {
                stateDescription = if (checked) "선택됨" else "선택 안 됨"
            }
            .sizeIn(minHeight = 48.dp)
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CheckMark(checked = checked)
        Spacer(Modifier.width(12.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = Ink,
            fontWeight = if (emphasize) FontWeight.Bold else FontWeight.Normal,
        )
        if (required) {
            Spacer(Modifier.width(8.dp))
            Text(
                text = "필수",
                style = MaterialTheme.typography.labelMedium,
                color = Blue,
            )
        }
    }
}

@Composable
private fun CheckMark(checked: Boolean) {
    Box(
        modifier = Modifier
            .size(24.dp)
            .clip(CircleShape)
            .background(if (checked) Blue else Gray200)
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Text(text = "✓", color = if (checked) Color.White else Ink3, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun PolicyLink(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = label }
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = "보기", style = MaterialTheme.typography.bodyMedium, color = Blue)
    }
}
