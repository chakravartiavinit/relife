# kotlinx.serialization: keep the generated serializers of our models (R8 would otherwise strip them).
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class com.relife.android.api.** {
    *** Companion;
}
-keepclasseswithmembers class com.relife.android.api.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.relife.android.api.**$$serializer { *; }
