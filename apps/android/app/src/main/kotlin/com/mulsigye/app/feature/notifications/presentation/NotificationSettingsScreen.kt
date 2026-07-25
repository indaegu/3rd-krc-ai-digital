package com.mulsigye.app.feature.notifications.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.BlueTint
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.designsystem.theme.WatchFg
import com.mulsigye.app.core.notifications.NotificationLogic

/**
 * 알림 설정 화면 — 순수 컴포저블(상태 + 콜백만). ~해요체, 큰 터치 타깃, TalkBack 라벨.
 *
 * 옵트인이 원칙이라 기본은 꺼짐이며, 유도(다크패턴) 문구를 두지 않는다. 마스터를 켤 때만
 * (라우트가) 권한을 요청하고, 거부되면 토글은 꺼진 채 힌트를 보여준다.
 */
@Composable
fun NotificationSettingsScreen(
    state: NotificationSettingsUiState,
    onBack: () -> Unit,
    onToggleEnabled: (Boolean) -> Unit,
    onToggleDaily: (Boolean) -> Unit,
    onAdjustDailyTime: (Int) -> Unit,
    onToggleStageAlert: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(com.mulsigye.app.core.designsystem.theme.Bg)
            .verticalScroll(rememberScrollState()),
    ) {
        // 상단 뒤로가기 + 제목.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .clickable(onClick = onBack)
                    .semantics(mergeDescendants = true) { contentDescription = "이전으로 돌아가기" }
                    .size(48.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = "←", style = MaterialTheme.typography.headlineLarge, color = Ink)
            }
            Spacer(Modifier.width(4.dp))
            Text(
                text = "알림 설정",
                style = MaterialTheme.typography.titleLarge,
                color = Ink,
                modifier = Modifier.semantics { heading() },
            )
        }

        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "우리 지역 물 사정을 알림으로 받아볼 수 있어요. 계정 없이 이 기기에서만 동작하고, 언제든 끌 수 있어요.",
                style = MaterialTheme.typography.bodyLarge,
                color = Ink2,
            )

            // 마스터 스위치.
            MulsigyeCard {
                ToggleRow(
                    title = "알림 받기",
                    subtitle = "먼저 켜야 아래 알림을 받을 수 있어요.",
                    checked = state.enabled,
                    onCheckedChange = onToggleEnabled,
                )
            }

            // 권한 거부 힌트(옵트인 유지 — 토글은 꺼진 채 안내만).
            if (state.permissionDenied) {
                MulsigyeCard {
                    Text(
                        text = "알림 권한이 꺼져 있어요",
                        style = MaterialTheme.typography.titleMedium,
                        color = WatchFg,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "휴대폰 설정 > 앱 > 수신호 > 알림에서 켜주세요.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink2,
                    )
                }
            }

            // 마스터가 켜졌을 때만 세부 설정을 보여준다.
            if (state.enabled) {
                MulsigyeCard {
                    ToggleRow(
                        title = "매일 정해진 시간에 받기",
                        subtitle = "매일 한 번, 우리 지역 물 사정을 알려드려요.",
                        checked = state.dailyEnabled,
                        onCheckedChange = onToggleDaily,
                    )
                    if (state.dailyEnabled && state.dailyTimeMinutes != null) {
                        Spacer(Modifier.height(12.dp))
                        DailyTimeAdjuster(
                            minutes = state.dailyTimeMinutes,
                            onAdjust = onAdjustDailyTime,
                        )
                    }
                }

                MulsigyeCard {
                    ToggleRow(
                        title = "단계가 나빠지면 알려주기",
                        subtitle = "우리 지역 가뭄 단계가 나빠질 때 한 번 알려드려요.",
                        checked = state.stageAlertEnabled,
                        onCheckedChange = onToggleStageAlert,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}

/** 제목·설명 + 스위치 한 줄. 스위치에 상태 설명을 붙여 TalkBack이 켬/꺼짐을 읽게 한다. */
@Composable
private fun ToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = title, style = MaterialTheme.typography.titleMedium, color = Ink)
            Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = Ink3)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            modifier = Modifier.semantics {
                contentDescription = title
                stateDescription = if (checked) "켜짐" else "꺼짐"
            },
        )
    }
}

/** 매일 알림 시각을 시/분 스텝 버튼으로 조정한다. 정확 알람이 아니라 근사 시각이면 충분하다. */
@Composable
private fun DailyTimeAdjuster(
    minutes: Int,
    onAdjust: (Int) -> Unit,
) {
    val step = NotificationSettingsViewModel.MINUTE_STEP
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "알림 시각",
            style = MaterialTheme.typography.bodyLarge,
            color = Ink2,
        )
        Spacer(Modifier.weight(1f))
        StepButton(
            glyph = "−",
            contentDescription = "시각 10분 앞으로",
            onClick = { onAdjust(wrapMinutes(minutes - step)) },
        )
        Text(
            text = NotificationLogic.formatDailyTime(minutes),
            style = MaterialTheme.typography.titleMedium,
            color = Ink,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .width(120.dp)
                .semantics { contentDescription = "알림 시각 ${NotificationLogic.formatDailyTime(minutes)}" },
        )
        StepButton(
            glyph = "+",
            contentDescription = "시각 10분 뒤로",
            onClick = { onAdjust(wrapMinutes(minutes + step)) },
        )
    }
}

private fun wrapMinutes(minutes: Int): Int {
    val perDay = 24 * 60
    return ((minutes % perDay) + perDay) % perDay
}

@Composable
private fun StepButton(
    glyph: String,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .background(BlueTint, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = glyph, style = MaterialTheme.typography.headlineSmall, color = Ink)
    }
}
