package com.mulsigye.app.feature.settings.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.theme.Gray50
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3

/**
 * 앱 환경설정 — 메인 헤더의 톱니로 들어오는 설정 모음. 각 항목은 기존 화면으로 가는 진입점이라
 * 이 화면 자체는 상태를 갖지 않는다(순수 컴포저블 + 콜백).
 *
 * 알림 설정은 옵트인이며 여기서도 중립적인 진입만 둔다(켜라고 부추기는 문구·배지 금지 —
 * design-system 콘텐츠 가드). 앱 버전은 호출자가 BuildConfig에서 넘긴다.
 */
@Composable
fun AppSettingsScreen(
    versionName: String,
    onBack: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onOpenRegions: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenLocationPolicy: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .size(48.dp)
                    .semantics { contentDescription = "뒤로" },
            ) {
                Text(text = "←", style = MaterialTheme.typography.headlineLarge)
            }
            Spacer(Modifier.width(4.dp))
            Text(
                text = "앱 환경설정",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
        }

        SettingsRow(title = "알림 설정", description = "물 사정 알림을 받을지 정해요", onClick = onOpenNotificationSettings)
        SettingsRow(title = "지역 설정", description = "우리 지역을 추가하거나 순서를 바꿔요", onClick = onOpenRegions)
        SettingsRow(title = "서비스 이용약관", onClick = onOpenTerms)
        SettingsRow(title = "개인정보 처리방침", onClick = onOpenPrivacy)
        SettingsRow(title = "위치정보 이용약관", onClick = onOpenLocationPolicy)

        Spacer(Modifier.width(4.dp))
        Text(
            text = "앱 버전 $versionName",
            style = MaterialTheme.typography.bodyMedium,
            color = Ink3,
            modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}

/** 설정 한 줄(카드). 터치 목표는 최소 60dp로 두어 고령 사용자도 누르기 쉽게 한다. */
@Composable
private fun SettingsRow(
    title: String,
    onClick: () -> Unit,
    description: String? = null,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { contentDescription = title },
        shape = RoundedCornerShape(12.dp),
        color = Gray50,
    ) {
        Row(
            modifier = Modifier
                .heightIn(min = 60.dp)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = title, style = MaterialTheme.typography.titleMedium, color = Ink)
                if (description != null) {
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink2,
                    )
                }
            }
            Text(text = "›", style = MaterialTheme.typography.titleLarge, color = Ink3)
        }
    }
}
