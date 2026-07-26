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
import com.mulsigye.app.feature.region.domain.ReservoirHit
import com.mulsigye.app.feature.region.domain.ReservoirSearchResult
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

/** 저수지 이름 검색 단계(주소 검색과 독립). */
sealed interface ReservoirPhase {
    data object Idle : ReservoirPhase
    data object Loading : ReservoirPhase
    data class Ready(val hits: List<ReservoirHit>) : ReservoirPhase
    data class Error(val message: String, val retryable: Boolean) : ReservoirPhase
}

data class RegionAddUiState(
    val query: String = "",
    val search: SearchPhase = SearchPhase.Idle,
    val selected: RegionCandidate? = null,
    val resolve: ResolvePhase = ResolvePhase.Idle,
    val registering: Boolean = false,
    /** 저수지 이름 검색어(주소 검색어와 별개로 둔다 — 탭을 옮겨도 각자 유지된다). */
    val reservoirQuery: String = "",
    val reservoirSearch: ReservoirPhase = ReservoirPhase.Idle,
    /** 사용자가 고른 저수지. 등록 확인 시트를 여는 조건이다. */
    val selectedReservoir: ReservoirHit? = null,
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
    private var reservoirJob: Job? = null

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

    /**
     * 확인 팝업 닫기 — 진행 중 확인 Job을 취소하고 선택·확인 상태만 비운다(검색 결과·검색어는 유지).
     * 사용자가 후보를 잘못 골랐을 때 팝업 딤/닫기로 되돌아오는 경로다.
     */
    fun dismissResolve() {
        resolveJob?.cancel()
        _uiState.update { it.copy(selected = null, resolve = ResolvePhase.Idle) }
    }

    private suspend fun runResolve(candidate: RegionCandidate) {
        // 읍·면·동/리를 함께 보내 시군 안에서 대표 저수지를 좁힌다(없으면 시군 단위).
        val result = regionRepository.resolve(
            admCd = candidate.admCd,
            legalCode = candidate.legalCode,
            emdNm = candidate.emdNm,
            liNm = candidate.liNm,
        )
        val phase = when (result) {
            is RegionResolveResult.Success -> ResolvePhase.Ready(result)
            is RegionResolveResult.Failure -> ResolvePhase.Error(result.message, result.retryable)
        }
        _uiState.update { it.copy(resolve = phase) }
    }

    fun onReservoirQueryChange(value: String) {
        _uiState.update { it.copy(reservoirQuery = value) }
        val term = value.trim()
        reservoirJob?.cancel()
        if (term.length < MIN_QUERY_LENGTH) {
            _uiState.update {
                it.copy(reservoirSearch = ReservoirPhase.Idle, selectedReservoir = null)
            }
            return
        }
        reservoirJob = viewModelScope.launch(dispatcher) {
            delay(debounceMillis)
            runReservoirSearch(term)
        }
    }

    fun retryReservoirSearch() {
        val term = _uiState.value.reservoirQuery.trim()
        if (term.length < MIN_QUERY_LENGTH) return
        reservoirJob?.cancel()
        reservoirJob = viewModelScope.launch(dispatcher) { runReservoirSearch(term) }
    }

    /** 준비되지 않은 시군은 고를 수 없다 — 목록에서 감추지 않고 선택만 막는다. */
    fun onReservoirSelect(hit: ReservoirHit) {
        if (!hit.prepared) return
        _uiState.update { it.copy(selectedReservoir = hit) }
    }

    fun dismissReservoir() {
        _uiState.update { it.copy(selectedReservoir = null) }
    }

    private suspend fun runReservoirSearch(term: String) {
        _uiState.update { it.copy(reservoirSearch = ReservoirPhase.Loading, selectedReservoir = null) }
        val phase = when (val result = regionRepository.searchReservoirs(term)) {
            is ReservoirSearchResult.Success -> ReservoirPhase.Ready(result.reservoirs)
            is ReservoirSearchResult.Failure ->
                ReservoirPhase.Error(result.message, result.retryable)
        }
        _uiState.update { it.copy(reservoirSearch = phase) }
    }

    /**
     * 저수지 이름으로 고른 지역을 등록한다. 주소 경로와 달리 resolve를 거치지 않는다 —
     * 검색 결과에 시군코드·시설코드·준비 여부가 이미 있다.
     */
    fun registerReservoir(setAsPrimary: Boolean, onRegistered: () -> Unit) {
        val state = _uiState.value
        val hit = state.selectedReservoir
        if (state.registering || hit == null || !hit.prepared) return

        _uiState.update { it.copy(registering = true) }
        viewModelScope.launch(dispatcher) {
            regionStore.addRegion(
                StoredRegion(sigunCode = hit.sigunCode, facCode = hit.facCode),
            )
            if (setAsPrimary) {
                regionStore.setPrimaryRegion(hit.sigunCode)
            }
            _uiState.value = RegionAddUiState()
            onRegistered()
        }
    }

    /**
     * 등록. 확인 완료·prepared·코드 존재를 모두 만족할 때만 저장하고, 중복 입력은 잠근다.
     * 저장 후 [onRegistered] 콜백으로 목록으로 복귀한다(라우팅은 호출자 몫).
     *
     * [setAsPrimary]("기본 주소지로 설정")가 켜지면 이 지역을 **목록 맨 위(대표)로 올린다**.
     * 대표의 정의가 "목록 0번"이라(product.md #7) 선택 인덱스만 바꾸면 콜드 스타트에서
     * 이전 지역으로 되돌아간다. 꺼지면 순서를 건드리지 않아 기존 대표가 그대로 유지된다.
     */
    fun register(setAsPrimary: Boolean, onRegistered: () -> Unit) {
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

            // "기본 주소지로 설정"이면 목록 맨 위로 올린다(대표 = index 0).
            if (setAsPrimary) {
                regionStore.setPrimaryRegion(sigunCode)
            }

            // ViewModel은 Activity 스코프라 화면을 떠나도 인스턴스가 유지된다. 초기화하지 않으면
            // 두 번째 지역 추가 진입 때 registering=true가 남아 '등록하기'가 무한 스피너로 잠긴다.
            _uiState.value = RegionAddUiState()
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
