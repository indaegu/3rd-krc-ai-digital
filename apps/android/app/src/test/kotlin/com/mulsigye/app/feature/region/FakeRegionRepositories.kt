package com.mulsigye.app.feature.region

import com.mulsigye.app.feature.region.domain.RegionRepository
import com.mulsigye.app.feature.region.domain.RegionResolveResult
import com.mulsigye.app.feature.region.domain.RegionSearchResult
import com.mulsigye.app.feature.region.domain.ReservoirSearchResult
import com.mulsigye.app.feature.status.domain.StatusRepository
import com.mulsigye.app.feature.status.domain.StatusResult

/**
 * 지역 검색·확인 테스트용 가짜 저장소. 큐가 있으면 순서대로, 없으면 default를 돌려준다.
 */
class FakeRegionRepository : RegionRepository {
    private val searchQueue = mutableListOf<RegionSearchResult>()
    private val resolveQueue = mutableListOf<RegionResolveResult>()
    var searchDefault: RegionSearchResult? = null
    var resolveDefault: RegionResolveResult? = null

    var searchCount = 0
        private set
    var resolveCount = 0
        private set
    var lastSearchQuery: String? = null
        private set

    /** 대표지를 읍·면·동/리로 좁히는지 확인하기 위해 마지막 resolve 인자를 남긴다. */
    var lastResolveEmdNm: String? = null
        private set
    var lastResolveLiNm: String? = null
        private set

    private val reservoirQueue = mutableListOf<ReservoirSearchResult>()
    var reservoirDefault: ReservoirSearchResult? = null
    var reservoirSearchCount = 0
        private set
    var lastReservoirQuery: String? = null
        private set

    fun enqueueReservoirSearch(vararg results: ReservoirSearchResult) {
        reservoirQueue.addAll(results)
    }

    fun enqueueSearch(vararg results: RegionSearchResult) {
        searchQueue.addAll(results)
    }

    fun enqueueResolve(vararg results: RegionResolveResult) {
        resolveQueue.addAll(results)
    }

    override suspend fun search(query: String): RegionSearchResult {
        searchCount += 1
        lastSearchQuery = query
        // removeFirst()는 compileSdk 36에서 API 35+ List 멤버로 바인딩돼 JDK 17에서 깨진다. removeAt(0)을 쓴다.
        return if (searchQueue.isNotEmpty()) searchQueue.removeAt(0) else requireNotNull(searchDefault)
    }

    override suspend fun resolve(
        admCd: String,
        legalCode: String,
        emdNm: String?,
        liNm: String?,
        facCode: String?,
    ): RegionResolveResult {
        resolveCount += 1
        lastResolveEmdNm = emdNm
        lastResolveLiNm = liNm
        return if (resolveQueue.isNotEmpty()) resolveQueue.removeAt(0) else requireNotNull(resolveDefault)
    }

    override suspend fun searchReservoirs(query: String): ReservoirSearchResult {
        reservoirSearchCount += 1
        lastReservoirQuery = query
        return if (reservoirQueue.isNotEmpty()) {
            reservoirQueue.removeAt(0)
        } else {
            requireNotNull(reservoirDefault)
        }
    }
}

/** 지역 목록 이름 표시용 가짜 status 저장소. sigunCode별 결과를 지정한다. */
class FakeStatusRepository : StatusRepository {
    private val results = mutableMapOf<String, StatusResult>()
    var default: StatusResult? = null

    var loadCount = 0
        private set

    fun put(sigunCode: String, result: StatusResult) {
        results[sigunCode] = result
    }

    /** 선택 저수지를 넘겼는지 확인할 수 있게 마지막 facCode를 남긴다. */
    var lastFacCode: String? = null
        private set

    override suspend fun load(
        sigunCode: String,
        facCode: String?,
        allowCached: Boolean,
    ): StatusResult {
        loadCount += 1
        lastFacCode = facCode
        return results[sigunCode] ?: requireNotNull(default)
    }
}
