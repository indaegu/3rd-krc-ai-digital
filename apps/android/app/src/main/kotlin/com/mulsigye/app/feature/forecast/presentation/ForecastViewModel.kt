package com.mulsigye.app.feature.forecast.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.feature.forecast.domain.ForecastRepository
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** 저수율 흐름 모듈 상태. 웹 ForecastState(discriminated union)와 동형. */
sealed interface ForecastUiState {
    data object Loading : ForecastUiState
    data class Ready(val data: ForecastResult.Success) : ForecastUiState
    data class Error(val message: String, val retryable: Boolean) : ForecastUiState
}

/**
 * 흐름 상세 forecast 모듈 ViewModel. 시군 코드로 getForecast를 부르고 Loading/Ready/Error로 노출한다.
 *
 * - refresh()는 이미 Loading이면 무시한다(웹 `forecast.kind !== "loading"` 가드와 동일한 중복 요청 방지).
 * - 예측·밴드·도달일·MAE는 서버 값이며 여기서 재계산하지 않는다(표시 전용, 규칙 10).
 */
class ForecastViewModel(
    private val repository: ForecastRepository,
    private val sigunCode: String,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val _uiState = MutableStateFlow<ForecastUiState>(ForecastUiState.Loading)
    val uiState: StateFlow<ForecastUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun refresh() {
        if (_uiState.value is ForecastUiState.Loading) {
            return
        }
        load()
    }

    private fun load() {
        _uiState.value = ForecastUiState.Loading
        viewModelScope.launch(dispatcher) {
            _uiState.value = when (val result = repository.load(sigunCode)) {
                is ForecastResult.Success -> ForecastUiState.Ready(result)
                is ForecastResult.Failure -> ForecastUiState.Error(
                    message = result.message,
                    retryable = result.retryable,
                )
            }
        }
    }

    class Factory(
        private val repository: ForecastRepository,
        private val sigunCode: String,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(ForecastViewModel::class.java))
            return ForecastViewModel(repository, sigunCode) as T
        }
    }
}
