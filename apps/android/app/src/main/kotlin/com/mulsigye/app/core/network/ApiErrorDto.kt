package com.mulsigye.app.core.network

import kotlinx.serialization.Serializable

@Serializable
data class ApiErrorDto(
    val code: String,
    val message: String,
    val retryable: Boolean,
)
