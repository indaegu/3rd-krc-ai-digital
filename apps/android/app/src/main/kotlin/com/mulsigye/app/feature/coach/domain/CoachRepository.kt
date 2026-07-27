package com.mulsigye.app.feature.coach.domain

interface CoachRepository {
    /**
     * 코치를 불러온다. forceRefresh=false면 만료되지 않은 캐시 성공을 네트워크 없이 재사용하고,
     * true면(사용자 새로고침) 캐시를 우회해 항상 다시 페치한다. 성공만 캐시하고 오류는 캐시하지 않는다.
     */
    /**
     * [facCode]는 사용자가 고른 저수지다. status와 같은 시설을 봐야 만수위 배너와 코치 행동이
     * 어긋나지 않는다. 없으면 서버가 규칙대로 대표지를 고른다.
     */
    suspend fun load(
        sigunCode: String,
        forceRefresh: Boolean = false,
        facCode: String? = null,
    ): CoachResult
}
