# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# [6. 아이콘 리소스 소실 복구]
# Drawable 및 Mipmap 리소스가 난독화 과정에서 제거되지 않도록 유지
-keep class **.R$drawable { *; }
-keep class **.R$mipmap { *; }
-keep class **.R$raw { *; }

# [4. Unity Ads 안정화]
# Unity Ads SDK ProGuard Rules
-keep class com.unity3d.ads.** { *; }
-keep interface com.unity3d.ads.** { *; }

