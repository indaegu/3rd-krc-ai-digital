package com.mulsigye.app.core.storage

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RegionStoreTest {
    private val testScope = TestScope(UnconfinedTestDispatcher())
    private lateinit var tmpDir: File
    private lateinit var dataStore: DataStore<Preferences>
    private lateinit var store: RegionStore

    private val nonsan = StoredRegion(sigunCode = "44230", facCode = "4423010045")
    private val naju = StoredRegion(sigunCode = "46170", facCode = "4617010001")
    private val jeju = StoredRegion(sigunCode = "50110", facCode = "5011010004")

    @Before
    fun setUp() {
        tmpDir = Files.createTempDirectory("regionstore").toFile()
        dataStore = PreferenceDataStoreFactory.create(scope = testScope.backgroundScope) {
            File(tmpDir, "region.preferences_pb")
        }
        store = RegionStore(dataStore)
    }

    @After
    fun tearDown() {
        tmpDir.deleteRecursively()
    }

    @Test
    fun startsEmpty() = testScope.runTest {
        val state = store.regionStoreFlow.first()
        assertEquals(RegionStore.SCHEMA_VERSION, state.schemaVersion)
        assertNull(state.consentVersion)
        assertTrue(state.regions.isEmpty())
        assertEquals(0, state.currentIndex)
    }

    @Test
    fun addsRegionsAndSelectsTheNewest() = testScope.runTest {
        store.addRegion(nonsan)
        store.addRegion(naju)
        val state = store.regionStoreFlow.first()
        assertEquals(listOf(nonsan, naju), state.regions)
        assertEquals(1, state.currentIndex)
    }

    @Test
    fun addingSameSigunDeduplicatesAndSelectsIt() = testScope.runTest {
        store.addRegion(nonsan)
        store.addRegion(naju)
        store.addRegion(StoredRegion(sigunCode = "44230", facCode = "4423099999"))
        val state = store.regionStoreFlow.first()
        assertEquals(2, state.regions.size)
        assertEquals("4423099999", state.regions[0].facCode)
        assertEquals(0, state.currentIndex)
    }

    @Test
    fun selectRegionClampsOutOfRange() = testScope.runTest {
        store.addRegion(nonsan)
        store.addRegion(naju)
        store.selectRegion(9)
        assertEquals(1, store.regionStoreFlow.first().currentIndex)
        store.selectRegion(-3)
        assertEquals(0, store.regionStoreFlow.first().currentIndex)
    }

    @Test
    fun removingRegionBeforeCurrentShiftsIndex() = testScope.runTest {
        store.addRegion(nonsan)
        store.addRegion(naju)
        store.addRegion(jeju) // currentIndex = 2
        store.removeRegion("44230") // remove index 0
        val state = store.regionStoreFlow.first()
        assertEquals(listOf(naju, jeju), state.regions)
        assertEquals(1, state.currentIndex)
    }

    @Test
    fun removingCurrentRegionClampsIndex() = testScope.runTest {
        store.addRegion(nonsan)
        store.addRegion(naju) // currentIndex = 1
        store.removeRegion("46170") // remove the selected last one
        val state = store.regionStoreFlow.first()
        assertEquals(listOf(nonsan), state.regions)
        assertEquals(0, state.currentIndex)
    }

    @Test
    fun setConsentPersistsOnlyTheVersion() = testScope.runTest {
        store.setConsent("consent-v1")
        assertEquals("consent-v1", store.regionStoreFlow.first().consentVersion)
    }

    @Test
    fun unknownSchemaVersionResetsToEmpty() = testScope.runTest {
        dataStore.edit {
            it[RegionStore.KEY] =
                """{"schemaVersion":2,"consentVersion":"x","regions":[{"sigunCode":"44230","facCode":"4423010045"}],"currentIndex":0}"""
        }
        val state = store.regionStoreFlow.first()
        assertTrue(state.regions.isEmpty())
        assertNull(state.consentVersion)
    }

    @Test
    fun corruptJsonResetsToEmpty() = testScope.runTest {
        dataStore.edit { it[RegionStore.KEY] = "{ this is not json" }
        assertTrue(store.regionStoreFlow.first().regions.isEmpty())
    }

    @Test
    fun currentIndexBeyondRangeIsClampedOnRead() = testScope.runTest {
        dataStore.edit {
            it[RegionStore.KEY] =
                """{"schemaVersion":1,"consentVersion":null,"regions":[{"sigunCode":"44230","facCode":"4423010045"}],"currentIndex":7}"""
        }
        assertEquals(0, store.regionStoreFlow.first().currentIndex)
    }

    @Test
    fun legacyPayloadWithoutRegionsKeepsHasEverRegisteredFalse() = testScope.runTest {
        // 지역이 없는 구버전 payload는 최초 사용자로 본다(false 유지).
        dataStore.edit {
            it[RegionStore.KEY] =
                """{"schemaVersion":1,"consentVersion":"consent-v1","regions":[],"currentIndex":0}"""
        }
        assertFalse(store.regionStoreFlow.first().hasEverRegistered)
    }

    @Test
    fun neverStoresAddressOrName() = testScope.runTest {
        // 주소·이름이 섞여 들어온 저장값을 읽어도 코드 2종만 남기고 재저장한다.
        dataStore.edit {
            it[RegionStore.KEY] =
                """{"schemaVersion":1,"consentVersion":null,"regions":[{"sigunCode":"44230","facCode":"4423010045","address":"전라남도 나주시 시청길 22","name":"논산시"}],"currentIndex":0}"""
        }
        store.selectRegion(0) // 읽기→변환→재저장 경유

        val raw = dataStore.data.first()[RegionStore.KEY]!!
        assertTrue(raw.contains("44230"))
        assertTrue(raw.contains("4423010045"))
        assertFalse(raw.contains("address"))
        assertFalse(raw.contains("시청길"))
        assertFalse(raw.contains("논산시"))
    }

    @Test
    fun moveRegionReordersAndKeepsCurrentPointingAtSameRegion() = testScope.runTest {
        store.addRegion(nonsan)
        store.addRegion(naju)
        store.addRegion(jeju) // regions = [nonsan, naju, jeju], currentIndex = 2 (jeju)

        // 맨 위(0)를 맨 아래(2)로 이동 → currentIndex는 여전히 jeju를 가리켜야 한다.
        store.moveRegion(0, 2)
        var state = store.regionStoreFlow.first()
        assertEquals(listOf(naju, jeju, nonsan), state.regions)
        assertEquals(1, state.currentIndex) // jeju는 이제 index 1

        // 현재 선택(jeju, index 1)을 맨 위로 이동 → currentIndex가 0으로 따라간다.
        store.moveRegion(1, 0)
        state = store.regionStoreFlow.first()
        assertEquals(listOf(jeju, naju, nonsan), state.regions)
        assertEquals(0, state.currentIndex)
    }

    @Test
    fun moveRegionIgnoresOutOfRangeOrNoop() = testScope.runTest {
        store.addRegion(nonsan)
        store.addRegion(naju)
        store.moveRegion(0, 0) // no-op
        store.moveRegion(0, 5) // out of range
        store.moveRegion(-1, 1) // out of range
        val state = store.regionStoreFlow.first()
        assertEquals(listOf(nonsan, naju), state.regions)
    }

    @Test
    fun hasEverRegisteredStartsFalseAndFlipsTrueOnAdd() = testScope.runTest {
        assertFalse(store.regionStoreFlow.first().hasEverRegistered)
        store.addRegion(nonsan)
        assertTrue(store.regionStoreFlow.first().hasEverRegistered)
    }

    @Test
    fun hasEverRegisteredStaysTrueAfterRemovingAllRegions() = testScope.runTest {
        store.addRegion(nonsan)
        store.removeRegion("44230")
        val state = store.regionStoreFlow.first()
        assertTrue(state.regions.isEmpty())
        assertTrue(state.hasEverRegistered) // 재방문(지역 삭제) 사용자 구분용으로 유지된다.
    }

    @Test
    fun hasEverRegisteredPersistsInStoredPayload() = testScope.runTest {
        store.addRegion(nonsan)
        val raw = dataStore.data.first()[RegionStore.KEY]!!
        assertTrue(raw.contains("hasEverRegistered"))
        assertTrue(raw.contains("true"))
    }

    @Test
    fun decodeMigratesHasEverRegisteredForOldPayloadWithRegions() = testScope.runTest {
        // 구 페이로드(필드 없음)라도 지역이 있으면 등록 이력이 있는 것이므로 true로 마이그레이션한다
        // (재방문 사용자가 지역을 지웠을 때 최초 검색으로 튀지 않도록).
        dataStore.edit {
            it[RegionStore.KEY] =
                """{"schemaVersion":1,"consentVersion":"consent-v1","regions":[{"sigunCode":"44230","facCode":"4423010045"}],"currentIndex":0}"""
        }
        val state = store.regionStoreFlow.first()
        assertTrue(state.hasEverRegistered)
        assertEquals(1, state.regions.size) // 나머지 필드는 정상 복원.
        assertEquals("consent-v1", state.consentVersion)
    }

    @Test
    fun addRegionWritesOnlyTwoCodes() = testScope.runTest {
        store.addRegion(nonsan)
        val raw = dataStore.data.first()[RegionStore.KEY]!!
        assertTrue(raw.contains("sigunCode"))
        assertTrue(raw.contains("facCode"))
        assertFalse(raw.contains("address"))
        assertFalse(raw.contains("label"))
    }
}
