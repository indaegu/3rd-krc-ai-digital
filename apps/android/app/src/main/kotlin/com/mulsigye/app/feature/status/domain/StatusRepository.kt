package com.mulsigye.app.feature.status.domain

interface StatusRepository {
    suspend fun load(sigunCode: String): StatusResult
}
