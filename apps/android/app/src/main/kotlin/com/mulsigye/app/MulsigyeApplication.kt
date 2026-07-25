package com.mulsigye.app

import android.app.Application
import com.mulsigye.app.app.AppContainer
import com.mulsigye.app.core.notifications.WaterNotifications

class MulsigyeApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this, BuildConfig.API_BASE_URL)
        // 옵트인 알림 채널을 미리 만들어 둔다(발송은 사용자가 켠 뒤에만 일어난다).
        WaterNotifications.ensureChannel(this)
    }
}
