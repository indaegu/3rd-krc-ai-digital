package com.mulsigye.app.feature.coach.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.feature.coach.domain.CoachRepository
import com.mulsigye.app.feature.coach.domain.CoachResult
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** 물시계 코치 모듈 상태. 웹 CoachCardState(discriminated union)와 동형. */
sealed interface CoachUiState {
    data object Loading : CoachUiState
    data class Ready(val data: CoachResult.Success) : CoachUiState
    data class Error(val message: String, val retryable: Boolean) : CoachUiState
}

/**
 * 물시계 코치 모듈 ViewModel. 시군 코드로 getCoach를 부르고 Loading/Ready/Error로 노출한다.
 *
 * - 비차단 로드: 코치는 다른 모듈(status·forecast)을 막지 않으며 실패해도 이 모듈만 오류가 된다.
 * - refresh()는 이미 Loading이면 무시한다(웹 `coach.kind !== "loading"` 가드와 동일).
 * - headline·summary·행동·mode·fallbackReason은 서버 값이며 여기서 재해석하지 않는다(표시 전용).
 */
class CoachViewModel(
    private val repository: CoachRepository,
    private val sigunCode: String,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val _uiState = MutableStateFlow<CoachUiState>(CoachUiState.Loading)
    val uiState: StateFlow<CoachUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun refresh() {
        if (_uiState.value is CoachUiState.Loading) {
            return
        }
        load()
    }

    private fun load() {
        _uiState.value = CoachUiState.Loading
        viewModelScope.launch(dispatcher) {
            _uiState.value = when (val result = repository.load(sigunCode)) {
                is CoachResult.Success -> CoachUiState.Ready(result)
                is CoachResult.Failure -> CoachUiState.Error(
                    message = result.message,
                    retryable = result.retryable,
                )
            }
        }
    }

    class Factory(
        private val repository: CoachRepository,
        private val sigunCode: String,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(CoachViewModel::class.java))
            return CoachViewModel(repository, sigunCode) as T
        }
    }
}
