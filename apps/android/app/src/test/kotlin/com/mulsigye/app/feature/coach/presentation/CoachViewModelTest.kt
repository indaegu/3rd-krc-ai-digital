package com.mulsigye.app.feature.coach.presentation

import com.mulsigye.app.core.testing.CoachFixtures
import com.mulsigye.app.feature.coach.domain.CoachRepository
import com.mulsigye.app.feature.coach.domain.CoachResult
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
class CoachViewModelTest {
    private val mainDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(mainDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun success() = CoachFixtures.success("coach.static.json")

    @Test
    fun movesFromLoadingToReady() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueCoachRepository(mutableListOf(success()))

        val vm = CoachViewModel(repo, "44230", dispatcher)
        assertTrue(vm.uiState.value is CoachUiState.Loading)

        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is CoachUiState.Ready)
        assertEquals(3, (state as CoachUiState.Ready).data.coach.actions.size)
    }

    @Test
    fun surfacesFailureAsError() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueCoachRepository(
            mutableListOf(
                CoachResult.Failure(
                    code = "SERVICE_UNAVAILABLE",
                    message = "잠시 후 다시 시도해요.",
                    retryable = true,
                ),
            ),
        )

        val vm = CoachViewModel(repo, "44230", dispatcher)
        advanceUntilIdle()

        assertEquals(
            CoachUiState.Error(message = "잠시 후 다시 시도해요.", retryable = true),
            vm.uiState.value,
        )
    }

    @Test
    fun refreshReloadsRepository() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueCoachRepository(
            mutableListOf(
                CoachResult.Failure(code = "SERVICE_UNAVAILABLE", message = "잠시 후 다시 시도해요.", retryable = true),
                success(),
            ),
        )

        val vm = CoachViewModel(repo, "44230", dispatcher)
        advanceUntilIdle()
        assertTrue(vm.uiState.value is CoachUiState.Error)

        vm.refresh()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is CoachUiState.Ready)
        assertEquals(2, repo.callCount)
    }

    @Test
    fun initialLoadUsesCacheAndRefreshForcesRefetch() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueCoachRepository(mutableListOf(success(), success()))

        val vm = CoachViewModel(repo, "44230", dispatcher)
        advanceUntilIdle()
        // 초기 로드는 캐시를 사용한다(forceRefresh=false).
        assertEquals(listOf(false), repo.forceRefreshCalls)

        vm.refresh()
        advanceUntilIdle()
        // 새로고침은 캐시를 우회한다(forceRefresh=true).
        assertEquals(listOf(false, true), repo.forceRefreshCalls)
    }

    @Test
    fun refreshIsIgnoredWhileLoading() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueCoachRepository(mutableListOf(success(), success(), success()))

        val vm = CoachViewModel(repo, "44230", dispatcher)

        vm.refresh()
        advanceUntilIdle()
        assertEquals(1, repo.callCount)

        vm.refresh()
        vm.refresh()
        advanceUntilIdle()
        assertEquals(2, repo.callCount)
    }
}

private class QueueCoachRepository(
    private val results: MutableList<CoachResult>,
) : CoachRepository {
    var callCount = 0
        private set

    /** load 호출마다 전달된 forceRefresh 값을 순서대로 기록한다. */
    val forceRefreshCalls = mutableListOf<Boolean>()

    override suspend fun load(sigunCode: String, forceRefresh: Boolean): CoachResult {
        callCount += 1
        forceRefreshCalls += forceRefresh
        return results.removeAt(0)
    }
}
