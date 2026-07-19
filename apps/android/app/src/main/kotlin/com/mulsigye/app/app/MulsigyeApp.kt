package com.mulsigye.app.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.feature.health.presentation.HealthScreen
import com.mulsigye.app.feature.health.presentation.HealthViewModel

@Composable
fun MulsigyeApp(container: AppContainer) {
    val healthViewModel: HealthViewModel = viewModel(
        factory = HealthViewModel.Factory(container.healthRepository)
    )
    val state by healthViewModel.uiState.collectAsStateWithLifecycle()

    MulsigyeTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Text(text = "AI 물관리 코치", color = MaterialTheme.colorScheme.primary)
            Text(text = "물시계", style = MaterialTheme.typography.displayLarge)
            Text(text = "우리 지역 물 사정을 살피고, 지금 할 일을 쉬운 말로 알려드려요.")
            HealthScreen(state = state, onRetry = healthViewModel::refresh)
            Text(
                text = "예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해 주세요.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
