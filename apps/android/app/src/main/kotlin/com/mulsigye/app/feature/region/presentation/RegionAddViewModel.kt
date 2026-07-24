package com.mulsigye.app.feature.region.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.core.storage.StoredRegion
import com.mulsigye.app.feature.region.domain.RegionCandidate
import com.mulsigye.app.feature.region.domain.RegionRepository
import com.mulsigye.app.feature.region.domain.RegionResolveResult
import com.mulsigye.app.feature.region.domain.RegionSearchResult
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** 주소 검색 단계. */
sealed interface SearchPhase {
    data object Idle : SearchPhase
    data object Loading : SearchPhase
    data class Ready(val candidates: List<RegionCandidate>) : SearchPhase
    data class Error(val message: String, val retryable: Boolean) : SearchPhase
}

/** 대표 저수지 확인 단계. */
sealed interface ResolvePhase {
    data object Idle : ResolvePhase
    data object Loading : ResolvePhase
    data class Ready(val data: RegionResolveResult.Success) : ResolvePhase
    data class Error(val message: String, val retryable: Boolean) : ResolvePhase
}

data class RegionAddUiState(
    val query: String = "",
    val search: SearchPhase = SearchPhase.Idle,
    val selected: RegionCandidate? = null,
    val resolve: ResolvePhase = ResolvePhase.Idle,
    val registering: Boolean = false,
)

/**
 * 지역 추가 ViewModel — 검색 디바운스 → searchRegions → resolveRegion → 등록.
 *
 * - 입력은 [debounceMillis] 만큼 디바운스한 뒤에만 검색한다(테스트는 0으로 즉시 실행).
 * - 후보 선택 시 대표 저수지를 확인하고, prepared=false면 등록을 막는다.
 * - 등록은 코드 2종만 [RegionStore]에 저장하며 주소 원문·검색어는 저장하지 않는다.
 * - 늦게 도착한 응답이 최신 상태를 덮지 않도록 검색·확인 Job을 취소로 직렬화한다.
 */
class RegionAddViewModel(
    private val regionRepository: RegionRepository,
    private val regionStore: RegionStore,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val debounceMillis: Long = DEFAULT_DEBOUNCE_MS,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegionAddUiState())
    val uiState: StateFlow<RegionAddUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null
    private var resolveJob: Job? = null

    fun onQueryChange(value: String) {
        _uiState.update { it.copy(query = value) }
        val term = value.trim()
        searchJob?.cancel()
        if (term.length < MIN_QUERY_LENGTH) {
            resolveJob?.cancel()
            _uiState.update {
                it.copy(search = SearchPhase.Idle, selected = null, resolve = ResolvePhase.Idle)
            }
            return
        }
        searchJob = viewModelScope.launch(dispatcher) {
            delay(debounceMillis)
            runSearch(term)
        }
    }

    fun retrySearch() {
        val term = _uiState.value.query.trim()
        if (term.length < MIN_QUERY_LENGTH) return
        searchJob?.cancel()
        searchJob = viewModelScope.launch(dispatcher) { runSearch(term) }
    }

    private suspend fun runSearch(term: String) {
        resolveJob?.cancel()
        _uiState.update {
            it.copy(search = SearchPhase.Loading, selected = null, resolve = ResolvePhase.Idle)
        }
        val phase = when (val result = regionRepository.search(term)) {
            is RegionSearchResult.Success -> SearchPhase.Ready(result.candidates)
            is RegionSearchResult.Failure -> SearchPhase.Error(result.message, result.retryable)
        }
        _uiState.update { it.copy(search = phase) }
    }

    fun onCandidateSelect(candidate: RegionCandidate) {
        resolveJob?.cancel()
        _uiState.update { it.copy(selected = candidate, resolve = ResolvePhase.Loading) }
        resolveJob = viewModelScope.launch(dispatcher) { runResolve(candidate) }
    }

    fun retryResolve() {
        val candidate = _uiState.value.selected ?: return
        resolveJob?.cancel()
        _uiState.update { it.copy(resolve = ResolvePhase.Loading) }
        resolveJob = viewModelScope.launch(dispatcher) { runResolve(candidate) }
    }

    private suspend fun runResolve(candidate: RegionCandidate) {
        val phase = when (val result = regionRepository.resolve(candidate.admCd, candidate.legalCode)) {
            is RegionResolveResult.Success -> ResolvePhase.Ready(result)
            is RegionResolveResult.Failure -> ResolvePhase.Error(result.message, result.retryable)
        }
        _uiState.update { it.copy(resolve = phase) }
    }

    /**
     * 등록. 확인 완료·prepared·코드 존재를 모두 만족할 때만 저장하고, 중복 입력은 잠근다.
     * 저장 후 [onRegistered] 콜백으로 목록으로 복귀한다(라우팅은 호출자 몫).
     */
    fun register(onRegistered: () -> Unit) {
        val state = _uiState.value
        val resolve = state.resolve
        if (state.registering || resolve !is ResolvePhase.Ready) return
        val data = resolve.data
        val sigunCode = data.sigunCode
        val reservoir = data.reservoir
        if (!data.prepared || sigunCode == null || reservoir == null) return

        _uiState.update { it.copy(registering = true) }
        viewModelScope.launch(dispatcher) {
            regionStore.addRegion(StoredRegion(sigunCode = sigunCode, facCode = reservoir.facCode))
            onRegistered()
        }
    }

    class Factory(
        private val regionRepository: RegionRepository,
        private val regionStore: RegionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(RegionAddViewModel::class.java))
            return RegionAddViewModel(regionRepository, regionStore) as T
        }
    }

    companion object {
        const val DEFAULT_DEBOUNCE_MS = 300L
        const val MIN_QUERY_LENGTH = 2
    }
}
