package com.mulsigye.app.core.testing

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * 순수 JVM 인메모리 [DataStore]. 파일·Android 프레임워크 없이 RegionStore를 테스트한다.
 *
 * 프리퍼런스 값을 [MutableStateFlow]로만 유지하므로 ViewModel 단위 테스트가
 * Robolectric 없이도 결정적으로 동작한다.
 */
class InMemoryPreferencesDataStore : DataStore<Preferences> {
    private val state = MutableStateFlow(emptyPreferences())
    private val mutex = Mutex()

    override val data: Flow<Preferences> = state.asStateFlow()

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences =
        mutex.withLock {
            val newData = transform(state.value)
            state.value = newData
            newData
        }
}
