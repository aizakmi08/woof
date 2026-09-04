# Device E2E

The Maestro flow is a repeatable device-level check for the shipped product-row regression. It runs against a development build and completes onboarding when the simulator is fresh. The fixture entry is compiled behind `__DEV__`; a release build must not expose it.

Run it only after a simulator has been booted by the operator and the development build is installed:

```sh
maestro test tests/e2e/maestro/dev-qa-product-open.yaml
```

Run the product-row flow across the required light/dark, default/maximum Dynamic Type, SE/large-iPhone matrix with:

```sh
npm run test:e2e:ios-matrix -- \
  --app "$HOME/Library/Developer/Xcode/DerivedData/<derived-data>/Build/Products/Debug-iphonesimulator/woof.app" \
  --metro-url http://<this-mac-lan-ip>:8081
```

The matrix runner creates or reuses `Woof E2E SE` and `Woof E2E Large` simulators, installs the supplied development app, runs all eight cells, and writes screenshots plus `results.json` under `docs/context-evidence/<date>/ios-e2e-product-open/`. `JAVA_HOME` may be supplied explicitly when Homebrew's OpenJDK is not registered system-wide.

This flow covers product-row opening only. It does not claim coverage for the rest of the release E2E scenarios. Every shipped localization must also be exercised; the current app ships only its development language, English. Simulator results do not satisfy physical-device checks for camera, purchases, VoiceOver, memory pressure, or low-storage behavior.
