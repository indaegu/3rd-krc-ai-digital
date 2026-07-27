package com.mulsigye.app.core.storage

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.mulsigye.app.core.testing.InMemoryPreferencesDataStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LastGoodStoreTest {
    private fun store(dataStore: InMemoryPreferencesDataStore, now: Long = 1_000L) =
        LastGoodStore(dataStore, clock = { now })

    @Test
    fun savesAndReadsBackPayloadWithTimestamp() = runTest {
        val store = store(InMemoryPreferencesDataStore(), now = 1_753_000_000_000L)

        store.save(LastGoodStore.KIND_STATUS, "44230", "{\"a\":1}")
        val entry = store.load(LastGoodStore.KIND_STATUS, "44230")

        assertEquals("{\"a\":1}", entry?.payload)
        assertEquals(1_753_000_000_000L, entry?.savedAt)
    }

    @Test
    fun keysAreIsolatedByKindAndKey() = runTest {
        val dataStore = InMemoryPreferencesDataStore()
        val store = store(dataStore)

        store.save(LastGoodStore.KIND_STATUS, "44230", "status")
        store.save(LastGoodStore.KIND_FORECAST, "44230", "forecast")

        assertEquals("status", store.load(LastGoodStore.KIND_STATUS, "44230")?.payload)
        assertEquals("forecast", store.load(LastGoodStore.KIND_FORECAST, "44230")?.payload)
        // 등록하지 않은 지역은 캐시가 없다.
        assertNull(store.load(LastGoodStore.KIND_STATUS, "50130"))
    }

    // 같은 시군이라도 사용자가 고른 저수지가 다르면 다른 키다(웹·Android 캐시 키 규칙과 동일).
    @Test
    fun replacesPreviousPayloadForSameKey() = runTest {
        val dataStore = InMemoryPreferencesDataStore()
        val store = store(dataStore)

        store.save(LastGoodStore.KIND_STATUS, "44230:4423010046", "old")
        store.save(LastGoodStore.KIND_STATUS, "44230:4423010046", "new")

        assertEquals("new", store.load(LastGoodStore.KIND_STATUS, "44230:4423010046")?.payload)
    }

    @Test
    fun keepsOnlyMostRecentEntriesPerKind() = runTest {
        val dataStore = InMemoryPreferencesDataStore()
        val store = store(dataStore)

        repeat(LastGoodStore.MAX_ENTRIES + 3) { index ->
            store.save(LastGoodStore.KIND_STATUS, "region-$index", "payload-$index")
        }

        // 가장 최근 MAX_ENTRIES건만 남는다 — 지역을 여러 번 바꿔도 저장이 무한히 늘지 않는다.
        assertEquals(
            "payload-${LastGoodStore.MAX_ENTRIES + 2}",
            store.load(LastGoodStore.KIND_STATUS, "region-${LastGoodStore.MAX_ENTRIES + 2}")?.payload,
        )
        assertNull(store.load(LastGoodStore.KIND_STATUS, "region-0"))
    }

    @Test
    fun corruptedJsonReadsAsNoCache() = runTest {
        val dataStore = InMemoryPreferencesDataStore()
        dataStore.edit { it[stringPreferencesKey("last_good_status")] = "{ not json" }

        assertNull(store(dataStore).load(LastGoodStore.KIND_STATUS, "44230"))
    }

    @Test
    fun clearRemovesEveryKind() = runTest {
        val dataStore = InMemoryPreferencesDataStore()
        val store = store(dataStore)
        store.save(LastGoodStore.KIND_STATUS, "44230", "status")
        store.save(LastGoodStore.KIND_FORECAST, "44230", "forecast")

        store.clear()

        assertNull(store.load(LastGoodStore.KIND_STATUS, "44230"))
        assertNull(store.load(LastGoodStore.KIND_FORECAST, "44230"))
    }

    // 폴리시에 "지역을 지우면 기기에 남은 기록이 사라져요"라고 적었다. 저장본도 함께 지워야 한다.
    @Test
    fun removeRegionsDropsBothKeyShapes() = runTest {
        val store = store(InMemoryPreferencesDataStore())
        store.save(LastGoodStore.KIND_STATUS, "44230:4423010046", "status")
        store.save(LastGoodStore.KIND_FORECAST, "44230", "forecast")
        store.save(LastGoodStore.KIND_STATUS, "50130", "other-region")

        store.removeRegions(setOf("44230"))

        assertNull(store.load(LastGoodStore.KIND_STATUS, "44230:4423010046"))
        assertNull(store.load(LastGoodStore.KIND_FORECAST, "44230"))
        // 다른 지역은 그대로 남는다.
        assertEquals("other-region", store.load(LastGoodStore.KIND_STATUS, "50130")?.payload)
    }
}
