import ExpoModulesCore
import Foundation
import Vision

public class WoofLabelOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WoofLabelOcr")

    AsyncFunction("recognizeText") { (imageUri: String) throws -> [String: Any] in
      let startedAt = DispatchTime.now()
      let imageUrl: URL

      if let parsedUrl = URL(string: imageUri), parsedUrl.isFileURL {
        imageUrl = parsedUrl
      } else {
        imageUrl = URL(fileURLWithPath: imageUri)
      }

      guard FileManager.default.fileExists(atPath: imageUrl.path) else {
        throw WoofLabelOcrError.imageNotFound
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["en-US"]
      request.usesLanguageCorrection = true
      request.minimumTextHeight = 0.012

      let handler = VNImageRequestHandler(url: imageUrl, options: [:])
      try handler.perform([request])

      let lines = (request.results ?? []).compactMap { observation -> [String: Any]? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        return [
          "text": candidate.string,
          "confidence": Double(candidate.confidence),
        ]
      }
      let text = lines.compactMap { $0["text"] as? String }.joined(separator: "\n")
      let elapsed = DispatchTime.now().uptimeNanoseconds - startedAt.uptimeNanoseconds

      return [
        "text": text,
        "lines": lines,
        "durationMs": Double(elapsed) / 1_000_000.0,
      ]
    }
  }
}

private enum WoofLabelOcrError: LocalizedError {
  case imageNotFound

  var errorDescription: String? {
    switch self {
    case .imageNotFound:
      return "The captured label image could not be opened."
    }
  }
}
