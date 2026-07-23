package com.mulsigye.app.feature.coach.domain

interface CoachRepository {
    suspend fun load(sigunCode: String): CoachResult
}
