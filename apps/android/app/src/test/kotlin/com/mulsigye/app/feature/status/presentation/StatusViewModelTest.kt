package com.mulsigye.app.feature.status.presentation

import com.mulsigye.app.core.testing.StatusFixtures
import com.mulsigye.app.feature.status.domain.StatusRepository
import com.mulsigye.app.feature.status.domain.StatusResult
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
class StatusViewModelTest {
    private val mainDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(mainDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun success() = StatusFixtures.success("status.normal.json")

    @Test
    fun movesFromLoadingToReady() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueStatusRepository(mutableListOf(success()))

        val vm = StatusViewModel(repo, "44230", dispatcher)
        assertTrue(vm.uiState.value is StatusUiState.Loading)

        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is StatusUiState.Ready)
        assertEquals("논산시", (state as StatusUiState.Ready).data.sigunName)
    }

    @Test
    fun surfacesFailureAsError() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueStatusRepository(
            mutableListOf(
                StatusResult.Failure(
                    code = "NETWORK_UNAVAILABLE",
                    message = "인터넷 연결을 확인해 주세요.",
                    retryable = true,
                ),
            ),
        )

        val vm = StatusViewModel(repo, "44230", dispatcher)
        advanceUntilIdle()

        assertEquals(
            StatusUiState.Error(message = "인터넷 연결을 확인해 주세요.", retryable = true),
            vm.uiState.value,
        )
    }

    @Test
    fun refreshReloadsRepository() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueStatusRepository(
            mutableListOf(
                StatusResult.Failure(code = "SERVICE_UNAVAILABLE", message = "잠시 후 다시 시도해 주세요.", retryable = true),
                success(),
            ),
        )

        val vm = StatusViewModel(repo, "44230", dispatcher)
        advanceUntilIdle()
        assertTrue(vm.uiState.value is StatusUiState.Error)

        vm.refresh()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is StatusUiState.Ready)
        assertEquals(2, repo.callCount)
    }

    @Test
    fun refreshIsIgnoredWhileLoading() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueStatusRepository(mutableListOf(success(), success(), success()))

        val vm = StatusViewModel(repo, "44230", dispatcher)

        // 최초 로딩 중(코루틴 실행 전)에 refresh를 눌러도 중복 요청되지 않는다.
        vm.refresh()
        advanceUntilIdle()
        assertEquals(1, repo.callCount)

        // Ready 이후 연속 refresh: 첫 호출이 Loading으로 만든 뒤 두 번째는 무시된다.
        vm.refresh()
        vm.refresh()
        advanceUntilIdle()
        assertEquals(2, repo.callCount)
    }
}

private class QueueStatusRepository(
    private val results: MutableList<StatusResult>,
) : StatusRepository {
    var callCount = 0
        private set

    override suspend fun load(sigunCode: String): StatusResult {
        callCount += 1
        // removeFirst()는 compileSdk 36에서 API 35+ List 멤버로 바인딩돼 JDK 17에서 실패한다.
        return results.removeAt(0)
    }
}
