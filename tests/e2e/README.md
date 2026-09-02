# Device E2E

The Maestro flow is a repeatable device-level check for the shipped product-row regression. It must run against a development build with an existing guest or linked session so the Home screen is visible. The fixture entry is compiled behind `__DEV__`; a release build must not expose it.

Run it only after a simulator has been booted by the operator and the development build is installed:

```sh
maestro test tests/e2e/maestro/dev-qa-product-open.yaml
```

Required release matrix remains: light and dark appearance; default and maximum Dynamic Type; one SE-class and one large iPhone; and every shipped localization. Store screenshots in `docs/context-evidence/<date>/` and record each matrix cell as PASS, FAIL, or NOT-RUN. Simulator results do not satisfy physical-device checks for camera, purchases, VoiceOver, memory pressure, or low-storage behavior.
