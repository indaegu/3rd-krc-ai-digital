package com.mulsigye.app.core.network

import kotlinx.serialization.json.Json
import retrofit2.Response

/**
 * 저장소 계층이 공유하는 오류 표현. 각 feature의 도메인 Failure로 옮겨 담는다.
 * status·forecast·coach·region 저장소가 동일한 코드·문구·retryable 규칙을 재사용한다.
 */
data class ApiFailure(
    val code: String,
    val message: String,
    val retryable: Boolean,
)

/** 인터넷 연결 오류(IOException). */
val NetworkFailure = ApiFailure(
    code = "NETWORK_UNAVAILABLE",
    message = "인터넷 연결을 확인해 주세요.",
    retryable = true,
)

/** 스키마 불일치·역직렬화·시각 파싱 실패 등 응답 형식 오류. */
val InvalidResponseFailure = ApiFailure(
    code = "INVALID_RESPONSE",
    message = "받은 정보를 확인하지 못했어요.",
    retryable = true,
)

/**
 * 실패 HTTP 응답의 errorBody를 [ApiErrorDto]로 파싱한다.
 * 서버 값(code·message·retryable)을 그대로 옮기고, 없으면 안전한 기본값을 쓴다.
 */
fun Response<*>.toApiFailure(json: Json): ApiFailure {
    val error = errorBody()?.string()?.let {
        runCatching { json.decodeFromString<ApiErrorDto>(it) }.getOrNull()
    }
    return ApiFailure(
        code = error?.code ?: "SERVICE_UNAVAILABLE",
        message = error?.message ?: "잠시 후 다시 시도해 주세요.",
        retryable = error?.retryable ?: true,
    )
}
