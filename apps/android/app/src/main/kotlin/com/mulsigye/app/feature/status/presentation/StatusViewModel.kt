package com.mulsigye.app.feature.status.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.feature.status.domain.StatusRepository
import com.mulsigye.app.feature.status.domain.StatusResult
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** 오늘 우리 저수지 모듈 상태. 웹 StatusState(discriminated union)와 동형. */
sealed interface StatusUiState {
    data object Loading : StatusUiState
    data class Ready(val data: StatusResult.Success) : StatusUiState
    data class Error(val message: String, val retryable: Boolean) : StatusUiState
}

/**
 * 메인 status 모듈 ViewModel. 시군 코드로 getStatus를 부르고 Loading/Ready/Error로 노출한다.
 *
 * - refresh()는 이미 Loading이면 무시한다(웹 `status.kind !== "loading"` 가드와 동일한
 *   중복 요청 방지). 로고 탭 새로고침이 연타돼도 요청은 한 번만 나간다.
 * - 단계·예측·만수위 판정은 서버 값이며 여기서 재계산하지 않는다(표시 전용).
 */
class StatusViewModel(
    private val repository: StatusRepository,
    private val sigunCode: String,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val _uiState = MutableStateFlow<StatusUiState>(StatusUiState.Loading)
    val uiState: StateFlow<StatusUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun refresh() {
        // 로딩 중 중복 요청 무시: value를 동기적으로 Loading으로 바꾸므로 연타도 한 번만 나간다.
        if (_uiState.value is StatusUiState.Loading) {
            return
        }
        load()
    }

    private fun load() {
        _uiState.value = StatusUiState.Loading
        viewModelScope.launch(dispatcher) {
            _uiState.value = when (val result = repository.load(sigunCode)) {
                is StatusResult.Success -> StatusUiState.Ready(result)
                is StatusResult.Failure -> StatusUiState.Error(
                    message = result.message,
                    retryable = result.retryable,
                )
            }
        }
    }

    class Factory(
        private val repository: StatusRepository,
        private val sigunCode: String,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(StatusViewModel::class.java))
            return StatusViewModel(repository, sigunCode) as T
        }
    }
}
