package com.mulsigye.app.feature.health.presentation

import com.mulsigye.app.feature.health.domain.HealthRepository
import com.mulsigye.app.feature.health.domain.HealthResult
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

// viewModelScope는 Dispatchers.Main.immediate를 쓰므로, Main을 테스트 디스패처로
// 바꿔야 로컬·CI 어디서든 같은 스케줄러 위에서 결정적으로 실행된다.
@OptIn(ExperimentalCoroutinesApi::class)
class HealthViewModelTest {
    private val mainDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(mainDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

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
        // removeFirst()는 compileSdk 36에서 API 35+의 List 멤버로 바인딩되어
        // JDK 17 테스트 JVM에서 NoSuchMethodError가 난다. removeAt(0)을 쓴다.
        return results.removeAt(0)
    }
}
