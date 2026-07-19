package com.mulsigye.app.feature.health.presentation

sealed interface HealthUiState {
    data object Loading : HealthUiState
    data class Ready(val stale: Boolean) : HealthUiState
    data class Error(
        val message: String,
        val retryable: Boolean,
    ) : HealthUiState
}
