package com.mulsigye.app.feature.status.presentation

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * sources 병합 순수 함수 검증(웹 page.tsx mergeSources와 동형).
 *
 * status를 앞에, forecast를 뒤에 붙이되 중복은 순서를 보존하며 제거한다.
 * status.sources는 항상 반영되고, forecast가 비어도(코치·예측 실패) 동작한다.
 */
class MergeSourcesTest {
    @Test
    fun keepsStatusFirstAndAppendsForecastWithoutDuplicates() {
        val merged = mergeSources(
            statusSources = listOf("논가뭄지도", "저수지 관측"),
            forecastSources = listOf("저수지 관측", "평년 통계"),
        )
        assertEquals(listOf("논가뭄지도", "저수지 관측", "평년 통계"), merged)
    }

    @Test
    fun preservesInsertionOrder() {
        val merged = mergeSources(
            statusSources = listOf("b", "a"),
            forecastSources = listOf("c"),
        )
        assertEquals(listOf("b", "a", "c"), merged)
    }

    @Test
    fun handlesEmptyForecastSources() {
        val merged = mergeSources(
            statusSources = listOf("논가뭄지도"),
            forecastSources = emptyList(),
        )
        assertEquals(listOf("논가뭄지도"), merged)
    }

    @Test
    fun handlesEmptyStatusSources() {
        val merged = mergeSources(
            statusSources = emptyList(),
            forecastSources = listOf("평년 통계"),
        )
        assertEquals(listOf("평년 통계"), merged)
    }
}
