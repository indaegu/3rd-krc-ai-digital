package com.mulsigye.app.feature.notifications.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.mulsigye.app.MulsigyeApplication
import com.mulsigye.app.app.PRIMARY_REGION_INDEX
import com.mulsigye.app.core.notifications.NotificationLogic
import com.mulsigye.app.core.notifications.WaterNotifications
import com.mulsigye.app.core.storage.NotificationHistoryEntry
import com.mulsigye.app.feature.status.domain.STAGE_ORDER
import com.mulsigye.app.feature.status.domain.StatusResult
import kotlinx.coroutines.flow.first

/**
 * 주기 실행마다: 옵트인 여부·대표 지역을 확인하고, 기존 Repository 계층으로 /api/v1/status를
 * 불러와 (1) 단계 악화 알림, (2) 매일 알림을 조건에 맞게 발송한다.
 *
 * - 대표 지역(index 0)이 없으면 아무 것도 하지 않는다(no-op success).
 * - KRC·Supabase를 직접 부르지 않고 반드시 StatusRepository(Retrofit /api/v1)를 재사용한다.
 * - 발송 판단·문구는 순수 [NotificationLogic]에 위임한다(여기서 단계 판정을 하지 않는다).
 */
class WaterCheckWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? MulsigyeApplication ?: return Result.success()
        val container = app.container

        val prefs = container.notificationPrefsStore.current()
        if (!prefs.enabled) return Result.success()

        val region = container.regionStore.regionStoreFlow.first()
            .regions.getOrNull(PRIMARY_REGION_INDEX) ?: return Result.success()

        val status = when (val result = container.statusRepository.load(region.sigunCode)) {
            is StatusResult.Success -> result
            is StatusResult.Failure ->
                // 네트워크·일시 오류면 다음 주기를 기다리기보다 한 번 재시도한다.
                return if (result.retryable) Result.retry() else Result.success()
        }

        // (1) 단계 악화 알림 — 매 실행 비교. 순서는 서버 stageBands 우선, 없으면 STAGE_ORDER 폴백.
        if (prefs.stageAlertEnabled) {
            val order = status.stageBands?.map { it.code }?.takeIf { it.isNotEmpty() } ?: STAGE_ORDER
            val currentCode = status.region.officialStage.code
            // 대표 지역이 바뀌면(순서 변경·삭제) 이전 기준선은 다른 지역 것이므로 악화 판단을 건너뛴다.
            // 같은 지역일 때만 비교해 오탐(엉뚱한 "단계가 나빠졌어요")을 막는다.
            val sameRegion = prefs.lastNotifiedSigunCode == region.sigunCode
            if (sameRegion &&
                NotificationLogic.shouldNotifyStageWorsened(prefs.lastNotifiedStageCode, currentCode, order)
            ) {
                val text = NotificationLogic.buildStageWorsenedText(status)
                val posted = WaterNotifications.post(
                    applicationContext,
                    WaterNotifications.STAGE_NOTIFICATION_ID,
                    NotificationLogic.STAGE_TITLE,
                    text,
                )
                // 실제로 발송된 경우에만 "알림 모아보기" 기록을 남긴다(권한 회수·토글 꺼짐이면
                // 알림이 뜨지 않으므로 받은 것처럼 보이면 안 된다).
                if (posted) {
                    container.notificationHistoryStore.record(
                        NotificationHistoryEntry(
                            title = NotificationLogic.STAGE_TITLE,
                            body = text,
                            receivedAt = System.currentTimeMillis(),
                            sigunCode = region.sigunCode,
                        ),
                    )
                }
            }
            // 알림 여부와 무관하게 기준선을 현재 지역·단계로 갱신(다음 악화만, 같은 지역에서만 알리도록).
            container.notificationPrefsStore.setLastNotified(region.sigunCode, currentCode)
        }

        // (2) 매일 알림 — 매일 시각이 설정된 경우에만(이 주기 실행이 그 시각에 맞춰 걸려 있다).
        if (prefs.dailyTimeMinutes != null) {
            val text = NotificationLogic.buildDailyText(status)
            val posted = WaterNotifications.post(
                applicationContext,
                WaterNotifications.DAILY_NOTIFICATION_ID,
                NotificationLogic.DAILY_TITLE,
                text,
            )
            if (posted) {
                container.notificationHistoryStore.record(
                    NotificationHistoryEntry(
                        title = NotificationLogic.DAILY_TITLE,
                        body = text,
                        receivedAt = System.currentTimeMillis(),
                        sigunCode = region.sigunCode,
                    ),
                )
            }
        }

        return Result.success()
    }
}
