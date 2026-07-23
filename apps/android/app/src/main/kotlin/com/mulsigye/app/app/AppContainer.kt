package com.mulsigye.app.app

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.feature.coach.data.DefaultCoachRepository
import com.mulsigye.app.feature.coach.data.remote.CoachApi
import com.mulsigye.app.feature.coach.domain.CoachRepository
import com.mulsigye.app.feature.forecast.data.DefaultForecastRepository
import com.mulsigye.app.feature.forecast.data.remote.ForecastApi
import com.mulsigye.app.feature.forecast.domain.ForecastRepository
import com.mulsigye.app.feature.region.data.DefaultRegionRepository
import com.mulsigye.app.feature.region.data.remote.RegionApi
import com.mulsigye.app.feature.region.domain.RegionRepository
import com.mulsigye.app.feature.status.data.DefaultStatusRepository
import com.mulsigye.app.feature.status.data.remote.StatusApi
import com.mulsigye.app.feature.status.domain.StatusRepository
import kotlinx.serialization.json.Json

// 지역·동의 저장용 단일 DataStore. 코드 2종·동의 버전만 저장한다(RegionStore).
private val Context.regionDataStore by preferencesDataStore(name = "mulsigye_region_store")

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

    val regionRepository: RegionRepository =
        DefaultRegionRepository(retrofit.create(RegionApi::class.java), json)

    val statusRepository: StatusRepository =
        DefaultStatusRepository(retrofit.create(StatusApi::class.java), json)

    val forecastRepository: ForecastRepository =
        DefaultForecastRepository(retrofit.create(ForecastApi::class.java), json)

    val coachRepository: CoachRepository =
        DefaultCoachRepository(retrofit.create(CoachApi::class.java), json)
}
