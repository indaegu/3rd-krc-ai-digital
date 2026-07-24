package com.mulsigye.app.core.testing

/** 테스트 리소스 `src/test/resources/fixtures/`의 계약 픽스처를 읽는다. */
object Fixtures {
    fun read(name: String): String =
        Fixtures::class.java.getResourceAsStream("/fixtures/$name")
            ?.bufferedReader()
            ?.use { it.readText() }
            ?: error("fixture not found: fixtures/$name")
}
