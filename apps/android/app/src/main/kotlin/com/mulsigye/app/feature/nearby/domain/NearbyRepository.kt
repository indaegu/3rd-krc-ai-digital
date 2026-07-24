package com.mulsigye.app.feature.nearby.domain

interface NearbyRepository {
    suspend fun load(sigunCode: String): NearbyResult
}
