import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}

val tools4CareEnv = Properties().apply {
    val file = rootProject.projectDir.parentFile.resolve(".env")
    if (file.exists()) file.inputStream().use(::load)
}
val supabaseUrl = localProperties.getProperty("tools4care.supabaseUrl")
    ?: tools4CareEnv.getProperty("VITE_SUPABASE_URL", "")
val supabaseAnonKey = localProperties.getProperty("tools4care.supabaseAnonKey")
    ?: tools4CareEnv.getProperty("VITE_SUPABASE_ANON_KEY", "")

android {
    namespace = "com.tools4care.payments"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tools4care.payments"
        minSdk = 30
        targetSdk = 35
        versionCode = 7
        versionName = "0.2.2-pilot"

        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    signingConfigs {
        create("tools4careRelease") {
            val keystorePath = providers.environmentVariable("T4C_ANDROID_KEYSTORE").orNull
            if (!keystorePath.isNullOrBlank()) storeFile = file(keystorePath)
            storePassword = providers.environmentVariable("T4C_ANDROID_STORE_PASSWORD").orNull
            keyAlias = providers.environmentVariable("T4C_ANDROID_KEY_ALIAS").orNull ?: "tools4care-terminal"
            keyPassword = providers.environmentVariable("T4C_ANDROID_KEY_PASSWORD").orNull
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isDebuggable = false
            signingConfig = signingConfigs.getByName("tools4careRelease")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.stripe:stripeterminal-core:5.3.0")
    implementation("com.stripe:stripeterminal-taptopay:5.3.0")
}
