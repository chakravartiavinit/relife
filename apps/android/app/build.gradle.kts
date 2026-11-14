import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// The product name lives in packages/brand/brand.json and nowhere else.
@Suppress("UNCHECKED_CAST")
val brand = JsonSlurper().parse(rootDir.resolve("../../packages/brand/brand.json")) as Map<String, Any?>
val contractFixtures = rootDir.resolve("../../packages/contract/fixtures")

android {
    namespace = "com.relife.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.relife.android"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        resValue("string", "app_name", brand["shortName"] as String)
    }

    // Release signing reads the keystore from the environment (CI sets these from repo secrets). Locally, or without
    // them, a release build is signed with the debug key so `assembleRelease` still works.
    val keystore = System.getenv("ANDROID_KEYSTORE_PATH")
    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Without a keystore a local release build falls back to the debug key, so it installs for testing. CI must
            // never ship that: a release built there without the keystore fails instead of quietly using the debug key.
            signingConfig = signingConfigs.findByName("release")
                ?: if (System.getenv("CI") != null) null else signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    testOptions {
        unitTests.all {
            // The contract tests decode the very files the Swift tests and the web tests use. No copies.
            it.systemProperty("contractFixtures", contractFixtures.absolutePath)
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.health.connect)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.play.services.code.scanner)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}

// A release built on CI has to be signed with the real key. Checked as soon as the task graph is known, so it fails in
// seconds, before anything is compiled.
gradle.taskGraph.whenReady {
    val releasing = allTasks.any { it.project == project && (it.name == "assembleRelease" || it.name == "bundleRelease" || it.name == "packageRelease") }
    if (releasing && System.getenv("CI") != null && System.getenv("ANDROID_KEYSTORE_PATH") == null) {
        throw GradleException("CI release builds need ANDROID_KEYSTORE_PATH (and the other ANDROID_KEY* variables). Refusing to sign with the debug key.")
    }
}
