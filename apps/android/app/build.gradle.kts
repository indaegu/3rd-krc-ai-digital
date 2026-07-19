import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val configuredApiBaseUrl = providers.gradleProperty("MULSIGYE_API_BASE_URL")
val releaseRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}

configuredApiBaseUrl.orNull?.let { configuredUrl ->
    require(configuredUrl.endsWith("/")) {
        "MULSIGYE_API_BASE_URL must end with a slash."
    }
}

if (releaseRequested) {
    val releaseUrl = configuredApiBaseUrl.orNull
    require(releaseUrl?.startsWith("https://") == true) {
        "Release builds require an HTTPS MULSIGYE_API_BASE_URL Gradle property."
    }
}

android {
    namespace = "com.mulsigye.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mulsigye.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            val debugUrl = configuredApiBaseUrl.orElse("http://10.0.2.2:3000/").get()
            val quotedDebugUrl = 34.toChar().toString() + debugUrl + 34.toChar()
            buildConfigField("String", "API_BASE_URL", quotedDebugUrl)
        }
        release {
            isMinifyEnabled = false
            val releaseUrl = configuredApiBaseUrl.orElse("https://invalid.invalid/").get()
            val quotedReleaseUrl = 34.toChar().toString() + releaseUrl + 34.toChar()
            buildConfigField("String", "API_BASE_URL", quotedReleaseUrl)
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

tasks.withType<Test>().configureEach {
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStackTraces = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx)
    implementation(libs.okhttp.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}
