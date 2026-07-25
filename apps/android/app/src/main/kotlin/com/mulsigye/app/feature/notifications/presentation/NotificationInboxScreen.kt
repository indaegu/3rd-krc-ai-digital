package com.mulsigye.app.feature.notifications.presentation

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.core.designsystem.component.MulsigyeCard
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2
import com.mulsigye.app.core.designsystem.theme.Ink3
import com.mulsigye.app.core.storage.NotificationHistoryEntry

/**
 * 알림 모아보기 — 이 기기가 실제로 보낸 알림을 최신순으로 다시 볼 수 있는 화면.
 *
 * 이미 받은 알림을 모아 보여주는 곳이라 "알림을 켜세요" 같은 유도 문구·배지는 두지 않는다
 * (design-system 콘텐츠 가드). 알림을 켜지 않아 기록이 없으면 중립적인 빈 상태만 보여주고,
 * 설정으로 가는 중립 링크를 하단에 둔다.
 *
 * 순수 컴포저블(상태 + 콜백). 시각 문구는 호출자가 만든 [formatTime]으로 렌더해 테스트가 결정적이다.
 */
@Composable
fun NotificationInboxScreen(
    entries: List<NotificationHistoryEntry>,
    onBack: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    formatTime: (Long) -> String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
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
                text = "알림 모아보기",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
        }

        if (entries.isEmpty()) {
            MulsigyeCard {
                Text(
                    text = "아직 받은 알림이 없어요",
                    style = MaterialTheme.typography.titleMedium,
                    color = Ink,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "알림을 받도록 설정하면 여기에 모아서 보여드려요.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Ink2,
                )
            }
        } else {
            entries.forEach { entry ->
                MulsigyeCard {
                    Text(
                        text = entry.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = Ink,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = entry.body,
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ink2,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = formatTime(entry.receivedAt),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink3,
                    )
                }
            }
        }

        // 중립 진입(유도 문구 없이 설정으로만 이동).
        Row(modifier = Modifier.fillMaxWidth()) {
            TextButton(
                onClick = onOpenNotificationSettings,
                modifier = Modifier.semantics { contentDescription = "알림 설정으로 이동" },
            ) {
                Text("알림 설정", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
