package com.mulsigye.app.core.storage

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** DataStore에 저장하는 지역 코드 2종. 주소 원문·지역 이름은 절대 담지 않는다. */
@Serializable
data class StoredRegion(
    /** KRC 시군 코드 5자리 */
    val sigunCode: String,
    /** 대표 저수지 KRC 시설코드 10자리 */
    val facCode: String,
)

/**
 * DataStore에 직렬화하는 저장소 전체 상태.
 * 저장 값은 지역 코드 2종·동의 버전·선택 인덱스뿐이다(docs/architecture.md, region-store.ts와 동치).
 */
@Serializable
data class RegionStoreState(
    val schemaVersion: Int = RegionStore.SCHEMA_VERSION,
    val consentVersion: String? = null,
    val regions: List<StoredRegion> = emptyList(),
    val currentIndex: Int = 0,
    /**
     * 한 번이라도 지역을 등록한 적이 있는지. 기본값 false라 기존 저장값(구 페이로드)도
     * 마이그레이션 없이 false로 안전 복원된다. [addRegion]에서 true로 올린다.
     * 최초 사용자(false)와 지역을 모두 지운 재방문 사용자(true)를 구분하는 데 쓴다.
     */
    val hasEverRegistered: Boolean = false,
)

/**
 * 지역·동의 로컬 저장소. 웹 `region-store.ts`와 저장 값·마이그레이션 규칙이 동치다.
 *
 * - 단일 Preferences 키 [KEY]에 JSON 문자열 하나로 저장한다.
 * - 손상 JSON·미지 schemaVersion·형식 오류는 안전 초기화(빈 상태)한다.
 * - 코드 2종·consentVersion만 저장하며, 주소 원문·검색어·지역 이름은 저장하지 않는다.
 */
class RegionStore(
    private val dataStore: DataStore<Preferences>,
) {
    // 저장 상태의 알 수 없는 필드(예: 잘못 섞여 들어온 주소)는 디코드 시 버린다.
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = true
    }

    val regionStoreFlow: Flow<RegionStoreState> =
        dataStore.data.map { prefs -> decode(prefs[KEY]) }

    /** 지역 추가. 이미 등록된 시군이면 중복 없이 그 지역을 선택한다. */
    suspend fun addRegion(region: StoredRegion) = update { store ->
        val existing = store.regions.indexOfFirst { it.sigunCode == region.sigunCode }
        if (existing >= 0) {
            val regions = store.regions.toMutableList().apply { this[existing] = region }
            store.copy(regions = regions, currentIndex = existing, hasEverRegistered = true)
        } else {
            val regions = store.regions + region
            store.copy(regions = regions, currentIndex = regions.lastIndex, hasEverRegistered = true)
        }
    }

    /**
     * 지역 순서 변경(#6 재정렬). [fromIndex]의 지역을 [toIndex]로 옮기고,
     * currentIndex는 "옮기기 전에 가리키던 그 지역"을 계속 가리키도록 재계산한다.
     * 인덱스가 범위를 벗어나거나 같으면 아무것도 하지 않는다.
     */
    suspend fun moveRegion(fromIndex: Int, toIndex: Int) = update { store ->
        val size = store.regions.size
        if (fromIndex == toIndex) return@update store
        if (fromIndex !in 0 until size || toIndex !in 0 until size) return@update store
        val regions = store.regions.toMutableList()
        val moved = regions.removeAt(fromIndex)
        regions.add(toIndex, moved)
        // currentIndex가 가리키던 지역이 이동 후에도 같은 지역을 가리키도록 보정한다.
        val newIndex = when (store.currentIndex) {
            fromIndex -> toIndex
            in (minOf(fromIndex, toIndex))..(maxOf(fromIndex, toIndex)) ->
                if (fromIndex < toIndex) store.currentIndex - 1 else store.currentIndex + 1
            else -> store.currentIndex
        }
        store.copy(regions = regions, currentIndex = clampIndex(newIndex, regions.size))
    }

    /** 지역 삭제. 현재 선택이 삭제되거나 앞당겨지면 currentIndex를 보정한다. */
    suspend fun removeRegion(sigunCode: String) = update { store ->
        val removed = store.regions.indexOfFirst { it.sigunCode == sigunCode }
        if (removed < 0) {
            store
        } else {
            val regions = store.regions.toMutableList().apply { removeAt(removed) }
            var index = store.currentIndex
            if (removed < index) index -= 1
            store.copy(regions = regions, currentIndex = clampIndex(index, regions.size))
        }
    }

    suspend fun selectRegion(index: Int) = update { store ->
        store.copy(currentIndex = clampIndex(index, store.regions.size))
    }

    suspend fun setConsent(version: String) = update { store ->
        store.copy(consentVersion = version)
    }

    private suspend fun update(transform: (RegionStoreState) -> RegionStoreState) {
        dataStore.edit { prefs ->
            val current = decode(prefs[KEY])
            prefs[KEY] = json.encodeToString(transform(current))
        }
    }

    /**
     * 저장 문자열 → 상태. 손상·미지 버전·형식 오류는 빈 상태로 안전 초기화한다.
     * 새 schemaVersion을 도입하면 여기서 이전 버전 → 현재 버전 변환을 처리한다(마이그레이션 훅).
     */
    private fun decode(raw: String?): RegionStoreState {
        if (raw == null) return RegionStoreState()
        val parsed = runCatching { json.decodeFromString<RegionStoreState>(raw) }.getOrNull()
            ?: return RegionStoreState()
        if (parsed.schemaVersion != SCHEMA_VERSION) return RegionStoreState()
        return parsed.copy(currentIndex = clampIndex(parsed.currentIndex, parsed.regions.size))
    }

    private fun clampIndex(index: Int, length: Int): Int {
        if (length == 0) return 0
        return index.coerceIn(0, length - 1)
    }

    companion object {
        const val SCHEMA_VERSION = 1
        val KEY = stringPreferencesKey("mulsigye_region_store")
    }
}
