const fs = require("node:fs");
const path = require("node:path");
const {
  createRunOncePlugin,
  withDangerousMod,
  withXcodeProject,
} = require("expo/config-plugins");

const IDS = {
  testGroup: "00E356E51AD99517003FC87E",
  testSourceRef: "00E356E61AD99517003FC87E",
  testSourceBuild: "00E356E71AD99517003FC87E",
  storeKitBuild: "00E356E81AD99517003FC87E",
  sourcesPhase: "00E356EB1AD99517003FC87E",
  frameworksPhase: "00E356EC1AD99517003FC87E",
  testTarget: "00E356ED1AD99517003FC87E",
  testProductRef: "00E356EF1AD99517003FC87E",
  resourcesPhase: "00E356F01AD99517003FC87E",
  debugConfig: "00E356F11AD99517003FC87E",
  releaseConfig: "00E356F21AD99517003FC87E",
  configList: "00E356F31AD99517003FC87E",
  storeKitRef: "F574F4F46A10000000000001",
};

function addCommentedObject(section, id, comment, value) {
  section[id] = value;
  section[`${id}_comment`] = comment;
}

function addChild(group, value, comment) {
  group.children = group.children || [];
  if (!group.children.some((child) => child.value === value)) {
    group.children.push({ value, comment });
  }
}

function projectName(config) {
  return config.modRequest.projectName || config.name.replace(/[^A-Za-z0-9_-]/g, "");
}

function ensureSourceFiles(config) {
  return withDangerousMod(config, ["ios", (config) => {
    const name = projectName(config);
    const sourceRoot = path.join(config.modRequest.projectRoot, "native", "ios");
    const appRoot = path.join(config.modRequest.platformProjectRoot, name);
    const testRoot = path.join(config.modRequest.platformProjectRoot, `${name}Tests`);

    fs.mkdirSync(appRoot, { recursive: true });
    fs.mkdirSync(testRoot, { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, "Woof.storekit"), path.join(appRoot, "Woof.storekit"));
    fs.copyFileSync(
      path.join(sourceRoot, "WoofConfigurationTests.swift"),
      path.join(testRoot, "WoofConfigurationTests.swift")
    );
    return config;
  }]);
}

function findGroupContaining(objects, childId) {
  const groups = objects.PBXGroup || {};
  return Object.keys(groups)
    .filter((key) => !key.endsWith("_comment"))
    .map((key) => ({ key, group: groups[key] }))
    .find(({ group }) => group.children?.some((child) => child.value === childId));
}

function storeKitScheme({ appTargetId, name }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1130"
   version = "1.3">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "NO"
            buildForArchiving = "NO"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${appTargetId}"
               BuildableName = "${name}.app"
               BlueprintName = "${name}"
               ReferencedContainer = "container:${name}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${appTargetId}"
            BuildableName = "${name}.app"
            BlueprintName = "${name}"
            ReferencedContainer = "container:${name}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
      <StoreKitConfigurationFileReference
         identifier = "../${name}/Woof.storekit">
      </StoreKitConfigurationFileReference>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${appTargetId}"
            BuildableName = "${name}.app"
            BlueprintName = "${name}"
            ReferencedContainer = "container:${name}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

function testableReference(name) {
  return `         <TestableReference
            skipped = "NO">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${IDS.testTarget}"
               BuildableName = "${name}Tests.xctest"
               BlueprintName = "${name}Tests"
               ReferencedContainer = "container:${name}.xcodeproj">
            </BuildableReference>
         </TestableReference>`;
}

function ensureNormalSchemeTest(scheme, name) {
  const withoutStoreKit = scheme.replace(
    /\s*<StoreKitConfigurationFileReference[\s\S]*?<\/StoreKitConfigurationFileReference>/g,
    ""
  );
  if (withoutStoreKit.includes(`${name}Tests.xctest`)) return withoutStoreKit;

  const testable = testableReference(name);
  if (/<Testables>\s*<\/Testables>/.test(withoutStoreKit)) {
    return withoutStoreKit.replace(/<Testables>\s*<\/Testables>/, `<Testables>\n${testable}\n      </Testables>`);
  }
  if (/<Testables\s*\/>/.test(withoutStoreKit)) {
    return withoutStoreKit.replace(/<Testables\s*\/>/, `<Testables>\n${testable}\n      </Testables>`);
  }
  throw new Error("Woof StoreKit plugin could not find the normal scheme Testables section");
}

function ensureXcodeProject(config) {
  return withXcodeProject(config, (config) => {
    const name = projectName(config);
    const project = config.modResults;
    const objects = project.hash.project.objects;
    const appTargetId = project.findTargetKey(name) || project.getFirstTarget().uuid;
    const appTarget = objects.PBXNativeTarget[appTargetId];
    const appProductRef = appTarget.productReference;
    const appFileRef = Object.keys(objects.PBXFileReference)
      .filter((key) => !key.endsWith("_comment"))
      .find((key) => objects.PBXFileReference[key].path === `${name}/AppDelegate.swift`);
    const appGroupEntry = appFileRef ? findGroupContaining(objects, appFileRef) : null;
    const productsGroupEntry = findGroupContaining(objects, appProductRef);
    const rootProject = project.getFirstProject().firstProject;
    const mainGroup = objects.PBXGroup[rootProject.mainGroup];

    if (!appGroupEntry || !productsGroupEntry || !mainGroup) {
      throw new Error("Woof StoreKit plugin could not resolve the generated Xcode groups");
    }

    const existingTestId = project.findTargetKey(`${name}Tests`);
    if (existingTestId && existingTestId !== IDS.testTarget) {
      throw new Error(`Unexpected ${name}Tests target id ${existingTestId}`);
    }

    addCommentedObject(objects.PBXFileReference, IDS.storeKitRef, "Woof.storekit", {
      isa: "PBXFileReference",
      lastKnownFileType: "text",
      name: "Woof.storekit",
      path: `${name}/Woof.storekit`,
      sourceTree: '"<group>"',
    });
    addCommentedObject(objects.PBXFileReference, IDS.testSourceRef, "WoofConfigurationTests.swift", {
      isa: "PBXFileReference",
      lastKnownFileType: "sourcecode.swift",
      path: "WoofConfigurationTests.swift",
      sourceTree: '"<group>"',
    });
    addCommentedObject(objects.PBXFileReference, IDS.testProductRef, `${name}Tests.xctest`, {
      isa: "PBXFileReference",
      explicitFileType: "wrapper.cfbundle",
      includeInIndex: 0,
      path: `${name}Tests.xctest`,
      sourceTree: "BUILT_PRODUCTS_DIR",
    });

    addCommentedObject(objects.PBXBuildFile, IDS.testSourceBuild, "WoofConfigurationTests.swift in Sources", {
      isa: "PBXBuildFile",
      fileRef: IDS.testSourceRef,
      fileRef_comment: "WoofConfigurationTests.swift",
    });
    addCommentedObject(objects.PBXBuildFile, IDS.storeKitBuild, "Woof.storekit in Resources", {
      isa: "PBXBuildFile",
      fileRef: IDS.storeKitRef,
      fileRef_comment: "Woof.storekit",
    });

    addCommentedObject(objects.PBXGroup, IDS.testGroup, `${name}Tests`, {
      isa: "PBXGroup",
      children: [{ value: IDS.testSourceRef, comment: "WoofConfigurationTests.swift" }],
      path: `${name}Tests`,
      sourceTree: '"<group>"',
    });
    addChild(appGroupEntry.group, IDS.storeKitRef, "Woof.storekit");
    addChild(mainGroup, IDS.testGroup, `${name}Tests`);
    addChild(productsGroupEntry.group, IDS.testProductRef, `${name}Tests.xctest`);

    addCommentedObject(objects.PBXSourcesBuildPhase, IDS.sourcesPhase, "Sources", {
      isa: "PBXSourcesBuildPhase",
      buildActionMask: 2147483647,
      files: [{ value: IDS.testSourceBuild, comment: "WoofConfigurationTests.swift in Sources" }],
      runOnlyForDeploymentPostprocessing: 0,
    });
    addCommentedObject(objects.PBXFrameworksBuildPhase, IDS.frameworksPhase, "Frameworks", {
      isa: "PBXFrameworksBuildPhase",
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    });
    addCommentedObject(objects.PBXResourcesBuildPhase, IDS.resourcesPhase, "Resources", {
      isa: "PBXResourcesBuildPhase",
      buildActionMask: 2147483647,
      files: [{ value: IDS.storeKitBuild, comment: "Woof.storekit in Resources" }],
      runOnlyForDeploymentPostprocessing: 0,
    });

    const testBuildSettings = {
      CODE_SIGNING_ALLOWED: "NO",
      GENERATE_INFOPLIST_FILE: "YES",
      IPHONEOS_DEPLOYMENT_TARGET: "15.1",
      PRODUCT_BUNDLE_IDENTIFIER: "io.woof.appTests",
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SDKROOT: "iphoneos",
      SKIP_INSTALL: "YES",
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: '"1,2"',
    };
    addCommentedObject(objects.XCBuildConfiguration, IDS.debugConfig, "Debug", {
      isa: "XCBuildConfiguration",
      buildSettings: { ...testBuildSettings },
      name: "Debug",
    });
    addCommentedObject(objects.XCBuildConfiguration, IDS.releaseConfig, "Release", {
      isa: "XCBuildConfiguration",
      buildSettings: { ...testBuildSettings },
      name: "Release",
    });
    addCommentedObject(
      objects.XCConfigurationList,
      IDS.configList,
      `Build configuration list for PBXNativeTarget "${name}Tests"`,
      {
        isa: "XCConfigurationList",
        buildConfigurations: [
          { value: IDS.debugConfig, comment: "Debug" },
          { value: IDS.releaseConfig, comment: "Release" },
        ],
        defaultConfigurationIsVisible: 0,
        defaultConfigurationName: "Release",
      }
    );

    addCommentedObject(objects.PBXNativeTarget, IDS.testTarget, `${name}Tests`, {
      isa: "PBXNativeTarget",
      buildConfigurationList: IDS.configList,
      buildConfigurationList_comment: `Build configuration list for PBXNativeTarget "${name}Tests"`,
      buildPhases: [
        { value: IDS.sourcesPhase, comment: "Sources" },
        { value: IDS.frameworksPhase, comment: "Frameworks" },
        { value: IDS.resourcesPhase, comment: "Resources" },
      ],
      buildRules: [],
      dependencies: [],
      name: `${name}Tests`,
      productName: `${name}Tests`,
      productReference: IDS.testProductRef,
      productReference_comment: `${name}Tests.xctest`,
      productType: '"com.apple.product-type.bundle.unit-test"',
    });
    if (!rootProject.targets.some((target) => target.value === IDS.testTarget)) {
      rootProject.targets.push({ value: IDS.testTarget, comment: `${name}Tests` });
    }
    rootProject.attributes = rootProject.attributes || {};
    rootProject.attributes.TargetAttributes = rootProject.attributes.TargetAttributes || {};
    rootProject.attributes.TargetAttributes[IDS.testTarget] = { CreatedOnToolsVersion: "26.0" };

    const schemesRoot = path.join(
      config.modRequest.platformProjectRoot,
      `${name}.xcodeproj`,
      "xcshareddata",
      "xcschemes"
    );
    const normalSchemePath = path.join(schemesRoot, `${name}.xcscheme`);
    const normalScheme = ensureNormalSchemeTest(fs.readFileSync(normalSchemePath, "utf8"), name);
    fs.writeFileSync(normalSchemePath, normalScheme);
    fs.writeFileSync(
      path.join(schemesRoot, `${name} StoreKit.xcscheme`),
      storeKitScheme({ appTargetId, name })
    );

    return config;
  });
}

const withWoofStoreKitTesting = (config) => ensureXcodeProject(ensureSourceFiles(config));

module.exports = createRunOncePlugin(
  withWoofStoreKitTesting,
  "with-woof-storekit-testing",
  "1.0.0"
);
