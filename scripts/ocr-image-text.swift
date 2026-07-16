import AppKit
import Foundation
import Vision

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}

guard CommandLine.arguments.count >= 2 else {
  fail("Usage: swift scripts/ocr-image-text.swift [--fast] [--no-language-correction] /path/to/image")
}

func makeRequest() -> VNRecognizeTextRequest {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = CommandLine.arguments.contains("--fast") ? .fast : .accurate
  request.usesLanguageCorrection = !CommandLine.arguments.contains("--no-language-correction")
  return request
}

guard let imagePath = CommandLine.arguments.dropFirst().first(where: { !$0.hasPrefix("--") }) else {
  fail("Usage: swift scripts/ocr-image-text.swift [--fast] [--no-language-correction] /path/to/image")
}
let imageUrl = URL(fileURLWithPath: imagePath)
var observations: [VNRecognizedTextObservation] = []

do {
  let request = makeRequest()
  try VNImageRequestHandler(url: imageUrl, options: [:]).perform([request])
  observations = request.results ?? []
} catch {
  guard let nsImage = NSImage(contentsOf: imageUrl) else {
    fail("Unable to load image: \(imagePath)")
  }

  var proposedRect = CGRect(origin: .zero, size: nsImage.size)
  guard let cgImage = nsImage.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
    fail("Unable to create CGImage: \(imagePath)")
  }

  do {
    let request = makeRequest()
    try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
    observations = request.results ?? []
  } catch {
    fail("OCR failed: \(error.localizedDescription)")
  }
}

let lines = observations
  .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
  .filter { !$0.isEmpty }

print(lines.joined(separator: "\n"))
