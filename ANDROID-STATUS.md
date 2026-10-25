# Android APK status

**Status: not yet built, signed, published, or device-verified.** AgroPurity currently ships as a responsive browser app with a PWA manifest and service worker. An installable PWA is not an Android APK.

A distributable APK requires an Android packaging project/toolchain, a compatible Android SDK, a signing setup, and a device-install test. None of those steps is represented as complete here. Do not add an APK download URL until a real release artifact has been created and verified. Keep release keystores and signing secrets out of Git.

Suggested next path: add Capacitor after the browser core is stable, generate the Android project, build a signed release APK in a controlled environment, install it on a compatible Android device, verify camera/file selection/local storage/restart/back navigation/offline analysis, and attach the verified APK to a GitHub Release. The website should link only to that actual release asset.
