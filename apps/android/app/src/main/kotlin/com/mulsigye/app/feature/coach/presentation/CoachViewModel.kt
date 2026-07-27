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

/** 수신호 코치 모듈 상태. 웹 CoachCardState(discriminated union)와 동형. */
sealed interface CoachUiState {
    data object Loading : CoachUiState
    data class Ready(val data: CoachResult.Success) : CoachUiState
    data class Error(val message: String, val retryable: Boolean) : CoachUiState
}

/**
 * 수신호 코치 모듈 ViewModel. 시군 코드로 getCoach를 부르고 Loading/Ready/Error로 노출한다.
 *
 * - 비차단 로드: 코치는 다른 모듈(status·forecast)을 막지 않으며 실패해도 이 모듈만 오류가 된다.
 * - refresh()는 이미 Loading이면 무시한다(웹 `coach.kind !== "loading"` 가드와 동일).
 * - headline·summary·행동·mode·fallbackReason은 서버 값이며 여기서 재해석하지 않는다(표시 전용).
 */
class CoachViewModel(
    private val repository: CoachRepository,
    private val sigunCode: String,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
    /** 사용자가 고른 저수지. status와 같은 시설을 봐야 만수위 행동이 어긋나지 않는다. */
    private val facCode: String? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow<CoachUiState>(CoachUiState.Loading)
    val uiState: StateFlow<CoachUiState> = _uiState.asStateFlow()

    init {
        // 초기 로드는 캐시를 사용한다(반복 진입 때 코치를 재사용). 캐시 히트는 곧장 Ready로 간다.
        load(forceRefresh = false)
    }

    fun refresh() {
        if (_uiState.value is CoachUiState.Loading) {
            return
        }
        // 사용자 새로고침은 캐시를 우회해 항상 다시 페치한다.
        load(forceRefresh = true)
    }

    private fun load(forceRefresh: Boolean) {
        _uiState.value = CoachUiState.Loading
        viewModelScope.launch(dispatcher) {
            _uiState.value = when (
                val result = repository.load(sigunCode, forceRefresh, facCode)
            ) {
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
        /** 저장된 선택 저수지. 없으면 서버가 규칙대로 대표지를 고른다. */
        private val facCode: String? = null,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(CoachViewModel::class.java))
            return CoachViewModel(repository, sigunCode, facCode = facCode) as T
        }
    }
}
