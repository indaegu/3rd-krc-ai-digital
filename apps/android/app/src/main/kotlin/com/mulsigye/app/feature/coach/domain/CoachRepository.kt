package com.mulsigye.app.feature.coach.domain

interface CoachRepository {
    /**
     * 코치를 불러온다. forceRefresh=false면 만료되지 않은 캐시 성공을 네트워크 없이 재사용하고,
     * true면(사용자 새로고침) 캐시를 우회해 항상 다시 페치한다. 성공만 캐시하고 오류는 캐시하지 않는다.
     */
    suspend fun load(sigunCode: String, forceRefresh: Boolean = false): CoachResult
}
