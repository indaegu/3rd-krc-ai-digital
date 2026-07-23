package com.mulsigye.app.core.ui

import android.content.Context
import android.provider.Settings
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ReducedMotionTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun reducedMotionWithAnimatorScale(scale: Float): Boolean {
        val context = ApplicationProvider.getApplicationContext<Context>()
        Settings.Global.putFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            scale,
        )
        var observed: Boolean? = null
        composeTestRule.setContent { observed = rememberReducedMotion() }
        composeTestRule.waitForIdle()
        return requireNotNull(observed)
    }

    @Test
    fun reducedMotionTrueWhenAnimatorDurationScaleIsZero() {
        assertEquals(true, reducedMotionWithAnimatorScale(0f))
    }

    @Test
    fun reducedMotionFalseWhenAnimationsEnabled() {
        assertEquals(false, reducedMotionWithAnimatorScale(1f))
    }
}
