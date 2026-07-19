package com.mulsigye.app

import android.app.Application
import com.mulsigye.app.app.AppContainer

class MulsigyeApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(BuildConfig.API_BASE_URL)
    }
}
