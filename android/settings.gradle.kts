pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

rootProject.name = "android-monorepo"

val modules = listOf(
    ":app",
    ":core",
    ":feature-obd-core",
    ":feature-obd-ui",
    ":feature-payments",
    ":feature-reports",
    ":platform-background"
)
modules.forEach { include(it) }
