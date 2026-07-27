package com.mulsigye.app.feature.status.domain

interface StatusRepository {
    /**
     * [facCode]는 사용자가 저수지 이름으로 직접 고른 시설코드다. 주어지면 그 저수지로 조회한다
     * (서버가 같은 시군일 때만 쓴다). 없으면 서버가 규칙대로 대표지를 고른다.
     */
    /**
     * [allowCached]가 false면 통신이 끊겨도 저장본으로 되돌리지 않고 실패를 그대로 돌려준다.
     *
     * 화면은 오래된 값이라도 "언제 받았는지"와 함께 보여주는 편이 낫지만, 백그라운드 알림은
     * 그렇지 않다. 저장본으로 알림을 보내면 며칠 전 물 사정을 오늘 일처럼 알리게 되고,
     * 단계 기준선까지 덮어써서 나중에 실제로 나빠졌을 때의 알림을 삼켜 버린다.
     */
    suspend fun load(
        sigunCode: String,
        facCode: String? = null,
        allowCached: Boolean = true,
    ): StatusResult
}
