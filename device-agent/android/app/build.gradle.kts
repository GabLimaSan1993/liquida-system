plugins {
    id("com.android.application")
}

android {
    namespace = "com.liquida.deviceagent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.liquida.deviceagent"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug { isDebuggable = true }
        release { isMinifyEnabled = false }
    }
}

dependencies {}
