package com.mulsigye.app.feature.health.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HealthScreen(
    state: HealthUiState,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (state) {
                HealthUiState.Loading -> {
                    Text(
                        text = "물시계를 준비하고 있어요.",
                        style = MaterialTheme.typography.titleLarge,
                    )
                }

                is HealthUiState.Ready -> {
                    Text(
                        text = "물시계 서버와 연결됐어요.",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = if (state.stale) {
                            "최근 확인한 정보를 보여드려요."
                        } else {
                            "최신 정보를 받을 준비가 됐어요."
                        }
                    )
                }

                is HealthUiState.Error -> {
                    Text(
                        text = "서버 연결을 확인해 주세요.",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(text = state.message)
                    if (state.retryable) {
                        Button(
                            onClick = onRetry,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 56.dp),
                        ) {
                            Text(text = "다시 시도하기")
                        }
                    }
                }
            }
        }
    }
}
