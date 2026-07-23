package com.mulsigye.app.feature.region.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.feature.status.domain.StatusRepository
import com.mulsigye.app.feature.status.domain.StatusResult
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** 등록 지역 한 줄의 이름 표시 상태. 저장소에는 코드만 있으므로 status로 채운다. */
sealed interface RegionNameState {
    data object Loading : RegionNameState
    data class Ready(val sigunName: String, val reservoirName: String) : RegionNameState
    data object Error : RegionNameState
}

/** 등록 지역 한 줄. 시군 코드는 저장값, 이름은 status 병렬 호출 결과. */
data class RegionListItem(
    val sigunCode: String,
    val name: RegionNameState,
)

data class RegionListUiState(
    val loading: Boolean = true,
    val items: List<RegionListItem> = emptyList(),
    val currentIndex: Int = 0,
)

/**
 * 등록 지역 목록 ViewModel.
 *
 * - 저장소(RegionStore)에는 코드 2종만 있으므로 지역명·대표 저수지명은 getStatus를
 *   시군 코드별로 병렬 호출해 표시 용도로만 채운다(웹 RegionList와 동일 규칙).
 * - 선택 전환·삭제는 RegionStore에 위임하며 현재 인덱스 보정도 저장소가 담당한다.
 */
class RegionListViewModel(
    private val regionStore: RegionStore,
    private val statusRepository: StatusRepository,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {

    // 시군 코드 → 이름 표시 상태. 원자적 update만 하므로 병렬 로드에도 안전하다.
    private val nameStates = MutableStateFlow<Map<String, RegionNameState>>(emptyMap())

    // 이미 status를 요청한 코드. 단일 collect 코루틴에서만 건드려 중복 요청을 막는다.
    private val requested = mutableSetOf<String>()

    val uiState: StateFlow<RegionListUiState> =
        combine(regionStore.regionStoreFlow, nameStates) { store, names ->
            RegionListUiState(
                loading = false,
                items = store.regions.map { region ->
                    RegionListItem(
                        sigunCode = region.sigunCode,
                        name = names[region.sigunCode] ?: RegionNameState.Loading,
                    )
                },
                currentIndex = store.currentIndex,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = RegionListUiState(loading = true),
        )

    init {
        viewModelScope.launch(dispatcher) {
            regionStore.regionStoreFlow.collect { store ->
                store.regions.forEach { region ->
                    // add()가 true면 최초 요청. 각 코드의 이름을 병렬로 불러온다.
                    if (requested.add(region.sigunCode)) {
                        launch { loadName(region.sigunCode) }
                    }
                }
            }
        }
    }

    private suspend fun loadName(sigunCode: String) {
        val state = when (val result = statusRepository.load(sigunCode)) {
            is StatusResult.Success -> RegionNameState.Ready(
                sigunName = result.sigunName,
                reservoirName = result.reservoir.name,
            )
            is StatusResult.Failure -> RegionNameState.Error
        }
        nameStates.update { it + (sigunCode to state) }
    }

    fun select(index: Int) {
        viewModelScope.launch(dispatcher) { regionStore.selectRegion(index) }
    }

    fun remove(sigunCode: String) {
        viewModelScope.launch(dispatcher) { regionStore.removeRegion(sigunCode) }
    }

    class Factory(
        private val regionStore: RegionStore,
        private val statusRepository: StatusRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(RegionListViewModel::class.java))
            return RegionListViewModel(regionStore, statusRepository) as T
        }
    }
}
