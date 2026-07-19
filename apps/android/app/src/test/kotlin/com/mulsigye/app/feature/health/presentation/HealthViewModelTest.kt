package com.mulsigye.app.feature.health.presentation

import com.mulsigye.app.feature.health.domain.HealthRepository
import com.mulsigye.app.feature.health.domain.HealthResult
import java.time.Instant
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthViewModelTest {
    @Test
    fun movesFromLoadingToReady() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repository = QueueHealthRepository(
            mutableListOf(
                HealthResult.Success(
                    asOf = Instant.parse("2026-07-19T00:00:00Z"),
                    sources = emptyList(),
                    stale = false,
                )
            )
        )

        val viewModel = HealthViewModel(repository, dispatcher)
        advanceUntilIdle()

        assertEquals(HealthUiState.Ready(stale = false), viewModel.uiState.value)
    }

    @Test
    fun retryLoadsTheRepositoryAgain() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repository = QueueHealthRepository(
            mutableListOf(
                HealthResult.Failure(
                    code = "NETWORK_UNAVAILABLE",
                    message = "인터넷 연결을 확인해 주세요.",
                    retryable = true,
                ),
                HealthResult.Success(
                    asOf = Instant.parse("2026-07-19T00:00:00Z"),
                    sources = emptyList(),
                    stale = false,
                )
            )
        )

        val viewModel = HealthViewModel(repository, dispatcher)
        advanceUntilIdle()
        assertEquals(
            HealthUiState.Error(
                message = "인터넷 연결을 확인해 주세요.",
                retryable = true,
            ),
            viewModel.uiState.value
        )

        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(HealthUiState.Ready(stale = false), viewModel.uiState.value)
        assertEquals(2, repository.callCount)
    }
}

private class QueueHealthRepository(
    private val results: MutableList<HealthResult>,
) : HealthRepository {
    var callCount = 0
        private set

    override suspend fun load(): HealthResult {
        callCount += 1
        return results.removeFirst()
    }
}
