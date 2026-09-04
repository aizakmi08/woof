import ExpoModulesCore
import Foundation
import UIKit
import Vision

public class WoofLabelOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WoofLabelOcr")

    // Crop in UIKit after normalizing the camera file to an upright, scale-1
    // bitmap. expo-image-manipulator normalizes EXIF orientation internally,
    // which can make a preview-space crop address the wrong pixels on iPhone.
    // This method makes the displayed camera frame and the saved crop share one
    // explicit top-left coordinate system.
    AsyncFunction("cropToNormalizedRegion") {
      (
        imageUri: String,
        normalizedX: Double,
        normalizedY: Double,
        normalizedWidth: Double,
        normalizedHeight: Double
      ) throws -> [String: Any] in
      let imageUrl = try imageFileUrl(imageUri)

      guard let sourceImage = UIImage(contentsOfFile: imageUrl.path) else {
        throw WoofLabelOcrError.imageNotFound
      }

      let uprightImage = try renderUprightImage(sourceImage)
      let imageWidth = uprightImage.size.width
      let imageHeight = uprightImage.size.height
      guard imageWidth >= 1, imageHeight >= 1 else {
        throw WoofLabelOcrError.invalidImageDimensions
      }

      let requestedRect = CGRect(
        x: normalizedX * imageWidth,
        y: normalizedY * imageHeight,
        width: normalizedWidth * imageWidth,
        height: normalizedHeight * imageHeight
      ).integral
      let cropRect = requestedRect.intersection(
        CGRect(x: 0, y: 0, width: imageWidth, height: imageHeight)
      )
      guard !cropRect.isNull, cropRect.width >= 2, cropRect.height >= 2 else {
        throw WoofLabelOcrError.invalidCropRegion
      }

      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      let croppedImage = UIGraphicsImageRenderer(size: cropRect.size, format: format).image { _ in
        uprightImage.draw(at: CGPoint(x: -cropRect.origin.x, y: -cropRect.origin.y))
      }

      guard let jpegData = croppedImage.jpegData(compressionQuality: 0.96) else {
        throw WoofLabelOcrError.imageEncodingFailed
      }
      let outputUrl = FileManager.default.temporaryDirectory
        .appendingPathComponent("woof-label-\(UUID().uuidString).jpg")
      try jpegData.write(to: outputUrl, options: .atomic)

      return [
        "uri": outputUrl.absoluteString,
        "width": Int(cropRect.width),
        "height": Int(cropRect.height),
        "sourceWidth": Int(imageWidth),
        "sourceHeight": Int(imageHeight),
      ]
    }

    AsyncFunction("recognizeText") { (imageUri: String) throws -> [String: Any] in
      let startedAt = DispatchTime.now()
      let imageUrl = try imageFileUrl(imageUri)

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
          "bounds": [
            "x": Double(observation.boundingBox.origin.x),
            "y": Double(observation.boundingBox.origin.y),
            "width": Double(observation.boundingBox.size.width),
            "height": Double(observation.boundingBox.size.height),
          ],
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

private func imageFileUrl(_ imageUri: String) throws -> URL {
  let imageUrl: URL
  if let parsedUrl = URL(string: imageUri), parsedUrl.isFileURL {
    imageUrl = parsedUrl
  } else {
    imageUrl = URL(fileURLWithPath: imageUri)
  }
  guard FileManager.default.fileExists(atPath: imageUrl.path) else {
    throw WoofLabelOcrError.imageNotFound
  }
  return imageUrl
}

private func renderUprightImage(_ image: UIImage) throws -> UIImage {
  let outputSize: CGSize
  switch image.imageOrientation {
  case .left, .leftMirrored, .right, .rightMirrored:
    outputSize = CGSize(width: image.size.height, height: image.size.width)
  default:
    outputSize = image.size
  }

  guard outputSize.width >= 1, outputSize.height >= 1 else {
    throw WoofLabelOcrError.invalidImageDimensions
  }
  if image.imageOrientation == .up, image.scale == 1 {
    return image
  }

  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = true
  return UIGraphicsImageRenderer(size: outputSize, format: format).image { _ in
    image.draw(in: CGRect(origin: .zero, size: outputSize))
  }
}

private enum WoofLabelOcrError: LocalizedError {
  case imageNotFound
  case invalidImageDimensions
  case invalidCropRegion
  case imageEncodingFailed

  var errorDescription: String? {
    switch self {
    case .imageNotFound:
      return "The captured label image could not be opened."
    case .invalidImageDimensions:
      return "The captured label image has invalid dimensions."
    case .invalidCropRegion:
      return "The highlighted label frame is outside the captured image."
    case .imageEncodingFailed:
      return "The highlighted label frame could not be saved."
    }
  }
}
