package com.mulsigye.app.core.testing

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * 읽기·쓰기가 항상 [IOException]으로 실패하는 [DataStore]. 저장소가 가득 찼거나 파일이
 * 잠긴 상황을 재현한다.
 *
 * 저장 실패가 방금 받은 정상 응답을 버리거나 화면을 죽이지 않는지 확인하는 데 쓴다.
 */
class FailingPreferencesDataStore : DataStore<Preferences> {
    override val data: Flow<Preferences> = flow { throw IOException("read failed") }

    override suspend fun updateData(
        transform: suspend (t: Preferences) -> Preferences,
    ): Preferences = throw IOException("write failed")
}
