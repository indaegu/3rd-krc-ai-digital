package com.mulsigye.app.feature.forecast.presentation

import com.mulsigye.app.core.testing.ForecastFixtures
import com.mulsigye.app.feature.forecast.domain.ForecastRepository
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// viewModelScope는 Dispatchers.Main.immediate를 쓰므로 Main을 테스트 디스패처로 바꾼다.
@OptIn(ExperimentalCoroutinesApi::class)
class ForecastViewModelTest {
    private val mainDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(mainDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun success() = ForecastFixtures.success("forecast.watch.json")

    @Test
    fun movesFromLoadingToReady() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueForecastRepository(mutableListOf(success()))

        val vm = ForecastViewModel(repo, "46170", dispatcher)
        assertTrue(vm.uiState.value is ForecastUiState.Loading)

        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is ForecastUiState.Ready)
        assertEquals(18, (state as ForecastUiState.Ready).data.reach.days)
    }

    @Test
    fun surfacesFailureAsError() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueForecastRepository(
            mutableListOf(
                ForecastResult.Failure(
                    code = "NETWORK_UNAVAILABLE",
                    message = "인터넷 연결을 확인해 주세요.",
                    retryable = true,
                ),
            ),
        )

        val vm = ForecastViewModel(repo, "46170", dispatcher)
        advanceUntilIdle()

        assertEquals(
            ForecastUiState.Error(message = "인터넷 연결을 확인해 주세요.", retryable = true),
            vm.uiState.value,
        )
    }

    @Test
    fun refreshReloadsRepository() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueForecastRepository(
            mutableListOf(
                ForecastResult.Failure(code = "SERVICE_UNAVAILABLE", message = "잠시 후 다시 시도해요.", retryable = true),
                success(),
            ),
        )

        val vm = ForecastViewModel(repo, "46170", dispatcher)
        advanceUntilIdle()
        assertTrue(vm.uiState.value is ForecastUiState.Error)

        vm.refresh()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is ForecastUiState.Ready)
        assertEquals(2, repo.callCount)
    }

    @Test
    fun refreshIsIgnoredWhileLoading() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueForecastRepository(mutableListOf(success(), success(), success()))

        val vm = ForecastViewModel(repo, "46170", dispatcher)

        vm.refresh()
        advanceUntilIdle()
        assertEquals(1, repo.callCount)

        vm.refresh()
        vm.refresh()
        advanceUntilIdle()
        assertEquals(2, repo.callCount)
    }
}

private class QueueForecastRepository(
    private val results: MutableList<ForecastResult>,
) : ForecastRepository {
    var callCount = 0
        private set

    override suspend fun load(sigunCode: String): ForecastResult {
        callCount += 1
        return results.removeAt(0)
    }
}
