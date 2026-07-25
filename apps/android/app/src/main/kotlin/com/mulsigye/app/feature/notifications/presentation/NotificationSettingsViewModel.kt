package com.mulsigye.app.feature.notifications.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mulsigye.app.core.storage.NotificationPrefs
import com.mulsigye.app.core.storage.NotificationPrefsStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** 알림 설정 화면 상태(저장값 + 권한 거부 힌트). */
data class NotificationSettingsUiState(
    val enabled: Boolean = false,
    val dailyTimeMinutes: Int? = null,
    val stageAlertEnabled: Boolean = true,
    val permissionDenied: Boolean = false,
) {
    val dailyEnabled: Boolean get() = dailyTimeMinutes != null
}

/**
 * 알림 설정 ViewModel. 저장은 [NotificationPrefsStore]에, 스케줄 반영은 주입된 [reschedule]에 위임한다
 * (Context 의존을 화면 라우트에서 applicationContext로 캡처해 넘긴다 — VM은 프레임워크 프리, 테스트 용이).
 *
 * 권한 요청 UI(런타임 다이얼로그)는 화면이 소유하고, VM은 결과만 반영한다:
 * 허용이면 [confirmEnable], 거부면 [markPermissionDenied].
 */
class NotificationSettingsViewModel(
    private val store: NotificationPrefsStore,
    private val reschedule: (NotificationPrefs) -> Unit,
) : ViewModel() {

    private val permissionDenied = MutableStateFlow(false)

    val uiState: StateFlow<NotificationSettingsUiState> =
        combine(store.prefsFlow, permissionDenied) { prefs, denied ->
            NotificationSettingsUiState(
                enabled = prefs.enabled,
                dailyTimeMinutes = prefs.dailyTimeMinutes,
                stageAlertEnabled = prefs.stageAlertEnabled,
                permissionDenied = denied && !prefs.enabled,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = NotificationSettingsUiState(),
        )

    /** 권한이 이미 있거나 방금 허용됐을 때 마스터 on. */
    fun confirmEnable() = edit {
        permissionDenied.value = false
        store.setEnabled(true)
    }

    /** 마스터 off. 스케줄은 취소된다. */
    fun disable() = edit {
        permissionDenied.value = false
        store.setEnabled(false)
    }

    /** 권한 거부 시: 토글은 off로 두고 힌트를 띄운다. */
    fun markPermissionDenied() {
        permissionDenied.value = true
    }

    /** 매일 알림 on/off. on이면 시각을 [defaultMinutes]로 세우고, off면 null. */
    fun setDailyEnabled(enabled: Boolean, defaultMinutes: Int = DEFAULT_DAILY_MINUTES) = edit {
        store.setDailyTimeMinutes(if (enabled) defaultMinutes else null)
    }

    /** 매일 알림 시각(분) 변경. */
    fun setDailyTime(minutes: Int) = edit {
        store.setDailyTimeMinutes(minutes)
    }

    /** 단계 악화 알림 on/off. */
    fun setStageAlertEnabled(enabled: Boolean) = edit {
        store.setStageAlertEnabled(enabled)
    }

    /** 편집 후 항상 최신 스냅샷으로 스케줄을 다시 건다. */
    private fun edit(block: suspend () -> Unit) {
        viewModelScope.launch {
            block()
            reschedule(store.current())
        }
    }

    class Factory(
        private val store: NotificationPrefsStore,
        private val reschedule: (NotificationPrefs) -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(NotificationSettingsViewModel::class.java))
            return NotificationSettingsViewModel(store, reschedule) as T
        }
    }

    companion object {
        /** 매일 알림 기본 시각: 오전 8시(480분). */
        const val DEFAULT_DAILY_MINUTES = 8 * 60

        /** 시각 조정 단위(분). */
        const val MINUTE_STEP = 10
    }
}
