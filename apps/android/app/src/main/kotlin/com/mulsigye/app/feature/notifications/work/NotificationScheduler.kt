package com.mulsigye.app.feature.notifications.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.mulsigye.app.core.notifications.NotificationLogic
import com.mulsigye.app.core.storage.NotificationPrefs
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/**
 * 옵트인 로컬 알림의 WorkManager 배선. 고유 주기 작업 하나로 매일 알림·단계 알림을 함께 처리한다.
 *
 * - 정확 알람 권한을 쓰지 않는다(근사 타이밍). 매일 시각이 있으면 24h 주기 + 그 시각까지의 초기 지연,
 *   매일 시각이 없고 단계 알림만이면 12h 주기로 값싸게 단계 변화를 점검한다.
 * - 설정이 바뀌거나 앱을 열 때 [reschedule]로 다시 건다(UPDATE 정책이라 시각 변경이 반영된다).
 */
object NotificationScheduler {
    const val UNIQUE_WORK = "susinho_water_check"

    private const val DAILY_PERIOD_MINUTES = 24L * 60L
    private const val STAGE_ONLY_PERIOD_MINUTES = 12L * 60L
    private const val STAGE_ONLY_INITIAL_DELAY_MINUTES = 15L

    /**
     * 현재 설정에 맞춰 주기 작업을 걸거나 취소한다. [nowMinutesOfDay]는 테스트를 위해 주입 가능하다.
     */
    fun reschedule(
        context: Context,
        prefs: NotificationPrefs,
        nowMinutesOfDay: Int = currentMinutesOfDay(),
    ) {
        val workManager = WorkManager.getInstance(context)
        if (!prefs.hasActiveWork) {
            workManager.cancelUniqueWork(UNIQUE_WORK)
            return
        }

        val dailyTime = prefs.dailyTimeMinutes
        val periodMinutes: Long
        val initialDelayMinutes: Long
        if (dailyTime != null) {
            periodMinutes = DAILY_PERIOD_MINUTES
            initialDelayMinutes = NotificationLogic.dailyInitialDelayMinutes(nowMinutesOfDay, dailyTime)
        } else {
            periodMinutes = STAGE_ONLY_PERIOD_MINUTES
            initialDelayMinutes = STAGE_ONLY_INITIAL_DELAY_MINUTES
        }

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<WaterCheckWorker>(periodMinutes, TimeUnit.MINUTES)
            .setInitialDelay(initialDelayMinutes, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        workManager.enqueueUniquePeriodicWork(
            UNIQUE_WORK,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private fun currentMinutesOfDay(): Int = LocalTime.now().let { it.hour * 60 + it.minute }
}
