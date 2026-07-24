package com.mulsigye.app.feature.nearby.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.feature.nearby.domain.NearbyRepository
import com.mulsigye.app.feature.nearby.domain.NearbyResult
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** 주변 지역 비교 모듈 상태. 웹 nearby 상태(loading/ready/hidden)와 동형이되 Error도 노출한다. */
sealed interface NearbyUiState {
    data object Loading : NearbyUiState
    data class Ready(val data: NearbyResult.Success) : NearbyUiState
    data class Error(val message: String, val retryable: Boolean) : NearbyUiState
}

/**
 * 주변 지역 비교 모듈 ViewModel. 시군 코드로 getNearby를 부르고 Loading/Ready/Error로 노출한다.
 *
 * - 비차단 로드: 주변 비교는 다른 모듈(status·forecast·coach)을 막지 않으며 실패해도 이 모듈만 오류가 된다.
 * - 화면은 실패 시 카드를 조용히 감춘다(웹과 동일) — Error 상태를 렌더하지 않는 선택은 컴포저블이 한다.
 * - avgRatio·stageCode·정렬은 서버 값이며 여기서 재해석·재정렬하지 않는다(표시 전용).
 */
class NearbyViewModel(
    private val repository: NearbyRepository,
    private val sigunCode: String,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val _uiState = MutableStateFlow<NearbyUiState>(NearbyUiState.Loading)
    val uiState: StateFlow<NearbyUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun refresh() {
        if (_uiState.value is NearbyUiState.Loading) {
            return
        }
        load()
    }

    private fun load() {
        _uiState.value = NearbyUiState.Loading
        viewModelScope.launch(dispatcher) {
            _uiState.value = when (val result = repository.load(sigunCode)) {
                is NearbyResult.Success -> NearbyUiState.Ready(result)
                is NearbyResult.Failure -> NearbyUiState.Error(
                    message = result.message,
                    retryable = result.retryable,
                )
            }
        }
    }

    class Factory(
        private val repository: NearbyRepository,
        private val sigunCode: String,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(NearbyViewModel::class.java))
            return NearbyViewModel(repository, sigunCode) as T
        }
    }
}
