package com.mulsigye.app.core.network

import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object ApiClient {
    /**
     * 읽기 제한 시간.
     *
     * 코치는 캐시가 비면 서버가 Claude 응답을 기다린다. 서버 쪽 상한은 provider 20초에
     * 상류 조회가 더해지고 라우트가 30초까지 허용한다. OkHttp 기본값 10초를 그대로 두면
     * **정확히 그 느린 생성에서만** 기기 쪽이 먼저 끊겨, 사용자는 생성된 답도 서버가
     * 준비한 정적 폴백도 받지 못하고 오류 화면을 본다. 서버 상한보다 넉넉히 잡는다.
     */
    private const val READ_TIMEOUT_SECONDS = 35L

    /** 연결 수립은 오래 끌 이유가 없다. 음영지역에서는 빨리 실패해 저장본으로 넘어가는 편이 낫다. */
    private const val CONNECT_TIMEOUT_SECONDS = 10L

    /** 재시도·리다이렉트를 포함한 한 번의 호출 전체 상한. */
    private const val CALL_TIMEOUT_SECONDS = 40L

    private fun defaultHttpClient(): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()

    /** [httpClient]는 테스트에서 짧은 제한 시간을 넣기 위한 주입점이다. */
    fun create(
        baseUrl: String,
        json: Json,
        httpClient: OkHttpClient = defaultHttpClient(),
    ): Retrofit =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(httpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
}
