Pod::Spec.new do |s|
  s.name           = 'WoofLabelOcr'
  s.version        = '1.0.0'
  s.summary        = 'On-device pet food label OCR for Woof'
  s.description    = 'Uses Apple Vision to recognize front-package label text without uploading an image.'
  s.author         = 'Woof'
  s.homepage       = 'https://woof.app'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
