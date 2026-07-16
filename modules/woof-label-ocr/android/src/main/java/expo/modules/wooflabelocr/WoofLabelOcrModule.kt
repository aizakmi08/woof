package expo.modules.wooflabelocr

import android.net.Uri
import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WoofLabelOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WoofLabelOcr")

    AsyncFunction("recognizeText") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_OCR_UNAVAILABLE", "The app context is unavailable.", null)
        return@AsyncFunction
      }

      val startedAt = SystemClock.elapsedRealtimeNanos()
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(imageUri))
      } catch (error: Exception) {
        promise.reject("ERR_OCR_IMAGE", "The captured label image could not be opened.", error)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      recognizer.process(image)
        .addOnSuccessListener { result ->
          val lines = result.textBlocks.flatMap { block ->
            block.lines.map { line ->
              mapOf<String, Any?>(
                "text" to line.text,
                "confidence" to null,
              )
            }
          }
          val durationMs = (SystemClock.elapsedRealtimeNanos() - startedAt) / 1_000_000.0
          recognizer.close()
          promise.resolve(mapOf(
            "text" to lines.joinToString("\n") { it["text"] as String },
            "lines" to lines,
            "durationMs" to durationMs,
          ))
        }
        .addOnFailureListener { error ->
          recognizer.close()
          promise.reject("ERR_OCR_RECOGNITION", "Could not read text from the label.", error)
        }
    }
  }
}
