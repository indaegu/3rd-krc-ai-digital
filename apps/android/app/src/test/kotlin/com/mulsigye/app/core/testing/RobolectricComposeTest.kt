package com.mulsigye.app.core.testing

import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Robolectric + Compose UI 테스트 공용 베이스.
 *
 * - compileSdk는 36을 유지하되, Robolectric 런타임 SDK만 34로 낮춘다(플랜 Task 1 주의).
 * - Compose 렌더링에는 NATIVE 그래픽스 모드가 필요하다.
 *
 * JUnit `@RunWith`는 `@Inherited`, Robolectric은 `@Config`·`@GraphicsMode`를 상위
 * 클래스 계층에서 병합하므로 하위 테스트는 이 클래스를 상속하기만 하면 된다.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
abstract class RobolectricComposeTest
