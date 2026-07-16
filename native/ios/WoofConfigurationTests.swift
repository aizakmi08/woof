import Foundation
import StoreKitTest
import XCTest

final class WoofConfigurationTests: XCTestCase {
  func testExpireMonthlySubscriptionWhenExplicitlyEnabled() throws {
    guard ProcessInfo.processInfo.environment["WOOF_STOREKIT_EXPIRE_MONTHLY"] == "1" else {
      throw XCTSkip("Set WOOF_STOREKIT_EXPIRE_MONTHLY=1 for the explicit local expiry test.")
    }

    let session = try SKTestSession(configurationFileNamed: "Woof")
    session.disableDialogs = true
    session.timeRate = .oneSecondIsOneDay

    let subscriptionProductIDs: Set<String> = [
      "woof_pro_weekly",
      "woof_pro_monthly",
      "woof_pro_annual",
    ]
    let purchasedSubscriptionIDs = Set(
      session.allTransactions()
        .map(\.productIdentifier)
        .filter(subscriptionProductIDs.contains)
    )

    if purchasedSubscriptionIDs.contains("woof_pro_monthly") {
      try session.expireSubscription(productIdentifier: "woof_pro_monthly")
    }

    for productID in purchasedSubscriptionIDs where productID != "woof_pro_monthly" {
      try session.expireSubscription(productIdentifier: productID)
    }

    session.clearTransactions()
    XCTAssertTrue(session.allTransactions().isEmpty)
  }

  func testStoreKitProductsMatchRevenueCatCatalog() throws {
    let configURL = try XCTUnwrap(
      Bundle(for: Self.self).url(forResource: "Woof", withExtension: "storekit")
    )
    let data = try Data(contentsOf: configURL)
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: data) as? [String: Any]
    )
    let settings = try XCTUnwrap(root["settings"] as? [String: Any])
    XCTAssertEqual(settings["_storefront"] as? String, "USA")

    let groups = try XCTUnwrap(root["subscriptionGroups"] as? [[String: Any]])
    let subscriptions = groups.flatMap {
      $0["subscriptions"] as? [[String: Any]] ?? []
    }
    XCTAssertEqual(subscriptions.count, 3)

    let expected: [String: (price: String, period: String)] = [
      "woof_pro_weekly": ("4.99", "P1W"),
      "woof_pro_monthly": ("7.99", "P1M"),
      "woof_pro_annual": ("29.99", "P1Y"),
    ]

    for (productID, product) in expected {
      let subscription = try XCTUnwrap(
        subscriptions.first { $0["productID"] as? String == productID },
        "Missing StoreKit product \(productID)"
      )
      XCTAssertEqual(subscription["displayPrice"] as? String, product.price)
      XCTAssertEqual(subscription["recurringSubscriptionPeriod"] as? String, product.period)

      let introductoryOffer = try XCTUnwrap(
        subscription["introductoryOffer"] as? [String: Any]
      )
      XCTAssertEqual(introductoryOffer["paymentMode"] as? String, "free")
      XCTAssertEqual(introductoryOffer["subscriptionPeriod"] as? String, "P3D")
    }
  }
}
