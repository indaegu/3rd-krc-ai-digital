package com.mulsigye.app.feature.coach.data

import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.coach.data.remote.CoachResponseDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CoachResponseDtoTest {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }

    @Test
    fun decodesStaticFixture() {
        val d = json.decodeFromString<CoachResponseDto>(Fixtures.read("coach.static.json"))
        assertEquals("static", d.mode)
        assertEquals(false, d.dataStale)
        assertEquals("coach-v1", d.promptVersion)
        assertEquals("actions-v1", d.actionCatalogVersion)
        assertEquals("disabled", d.fallbackReason)
        assertEquals(3, d.coach.actions.size)
        assertEquals("care_save_paddy_water", d.coach.actions[0].id)
        assertEquals(false, d.stale)
    }

    @Test
    fun decodesStaleFixture() {
        val d = json.decodeFromString<CoachResponseDto>(Fixtures.read("coach.stale.json"))
        assertTrue(d.dataStale)
        assertTrue(d.stale)
        assertEquals("static", d.mode)
    }
}
