package com.mulsigye.app.feature.status.domain

interface StatusRepository {
    /**
     * [facCode]는 사용자가 저수지 이름으로 직접 고른 시설코드다. 주어지면 그 저수지로 조회한다
     * (서버가 같은 시군일 때만 쓴다). 없으면 서버가 규칙대로 대표지를 고른다.
     */
    suspend fun load(sigunCode: String, facCode: String? = null): StatusResult
}
