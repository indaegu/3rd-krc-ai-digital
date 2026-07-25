package com.mulsigye.app.app

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.storage.NotificationPrefsStore
import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.feature.coach.data.CoachCache
import com.mulsigye.app.feature.coach.data.DefaultCoachRepository
import com.mulsigye.app.feature.coach.data.remote.CoachApi
import com.mulsigye.app.feature.coach.domain.CoachRepository
import com.mulsigye.app.feature.forecast.data.DefaultForecastRepository
import com.mulsigye.app.feature.forecast.data.remote.ForecastApi
import com.mulsigye.app.feature.forecast.domain.ForecastRepository
import com.mulsigye.app.feature.nearby.data.DefaultNearbyRepository
import com.mulsigye.app.feature.nearby.data.remote.NearbyApi
import com.mulsigye.app.feature.nearby.domain.NearbyRepository
import com.mulsigye.app.feature.region.data.DefaultRegionRepository
import com.mulsigye.app.feature.region.data.remote.RegionApi
import com.mulsigye.app.feature.region.domain.RegionRepository
import com.mulsigye.app.feature.status.data.DefaultStatusRepository
import com.mulsigye.app.feature.status.data.remote.StatusApi
import com.mulsigye.app.feature.status.domain.StatusRepository
import kotlinx.serialization.json.Json

// 지역·동의 저장용 단일 DataStore. 코드 2종·동의 버전만 저장한다(RegionStore).
private val Context.regionDataStore by preferencesDataStore(name = "mulsigye_region_store")

// 옵트인 로컬 알림 설정 전용 DataStore. RegionStore와 분리한다(지역 페이로드에 섞지 않는다).
private val Context.notificationDataStore by preferencesDataStore(name = "mulsigye_notification_prefs")

class AppContainer(
    context: Context,
    apiBaseUrl: String,
) {
    // v1은 호환 가능한 additive 확장(필드 추가)을 허용한다(예: status에 highWaterNotice가 추가된 전례).
    // 설치형 Android 앱은 웹처럼 즉시 재배포가 안 되므로, 서버가 다음 additive v1 필드를 배포해도
    // 엄격 디코딩으로 현장 크래시가 나지 않도록 unknown key를 무시한다(플랜 Global Constraints).
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
    private val retrofit = ApiClient.create(apiBaseUrl, json)

    val regionStore: RegionStore = RegionStore(context.applicationContext.regionDataStore)

    val notificationPrefsStore: NotificationPrefsStore =
        NotificationPrefsStore(context.applicationContext.notificationDataStore)

    val regionRepository: RegionRepository =
        DefaultRegionRepository(retrofit.create(RegionApi::class.java), json)

    val statusRepository: StatusRepository =
        DefaultStatusRepository(retrofit.create(StatusApi::class.java), json)

    val forecastRepository: ForecastRepository =
        DefaultForecastRepository(retrofit.create(ForecastApi::class.java), json)

    // 코치 캐시는 AppContainer(앱 수명)가 들고 있어 지역별 CoachViewModel 재생성에도 살아남는다.
    // 반복 진입 때 /api/v1/coach를 다시 부르지 않고 30분 TTL 안에서 성공 응답을 재사용한다.
    private val coachCache = CoachCache()

    val coachRepository: CoachRepository =
        DefaultCoachRepository(retrofit.create(CoachApi::class.java), json, coachCache)

    val nearbyRepository: NearbyRepository =
        DefaultNearbyRepository(retrofit.create(NearbyApi::class.java), json)
}
