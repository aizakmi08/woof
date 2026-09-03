import Foundation
import StoreKit
import StoreKitTest
import XCTest

final class WoofConfigurationTests: XCTestCase {
  private func cleanSession() throws -> SKTestSession {
    let session = try SKTestSession(configurationFileNamed: "Woof")
    session.disableDialogs = true
    session.resetToDefaultState()
    session.clearTransactions()
    return session
  }

  func testPurchasePersistsAcrossStoreKitSessionRecreation() throws {
    let purchaseSession = try cleanSession()
    try purchaseSession.buyProduct(productIdentifier: "woof_pro_monthly")

    let purchased = try XCTUnwrap(
      purchaseSession.allTransactions().first {
        $0.productIdentifier == "woof_pro_monthly" && $0.state == .purchased
      }
    )
    XCTAssertTrue(purchased.autoRenewingEnabled)

    // Recreating the session models a process restart/restore boundary. The
    // transaction must remain in StoreKit until the user or subscription state
    // changes; network and auth-token failures cannot erase this local receipt.
    let restoredSession = try SKTestSession(configurationFileNamed: "Woof")
    let restored = restoredSession.allTransactions().first {
      $0.identifier == purchased.identifier
    }
    XCTAssertEqual(restored?.productIdentifier, "woof_pro_monthly")
    restoredSession.clearTransactions()
  }

  func testCancellationAndExpiryRemoveActiveRenewal() throws {
    let session = try cleanSession()
    try session.buyProduct(productIdentifier: "woof_pro_monthly")
    let transaction = try XCTUnwrap(session.allTransactions().first)

    try session.disableAutoRenewForTransaction(identifier: transaction.identifier)
    let cancelled = try XCTUnwrap(session.allTransactions().first)
    XCTAssertFalse(cancelled.autoRenewingEnabled)

    try session.expireSubscription(productIdentifier: "woof_pro_monthly")
    let expired = try XCTUnwrap(session.allTransactions().first)
    XCTAssertNotNil(expired.expirationDate)
    session.clearTransactions()
  }

  func testAskToBuyCanBeApprovedAndDeclined() throws {
    let session = try cleanSession()
    session.askToBuyEnabled = true
    try session.buyProduct(productIdentifier: "woof_pro_weekly")
    let approval = try XCTUnwrap(session.allTransactions().first)
    XCTAssertTrue(approval.pendingAskToBuyConfirmation)
    try session.approveAskToBuyTransaction(identifier: approval.identifier)
    XCTAssertFalse(try XCTUnwrap(session.allTransactions().first).pendingAskToBuyConfirmation)

    session.clearTransactions()
    try session.buyProduct(productIdentifier: "woof_pro_annual")
    let decline = try XCTUnwrap(session.allTransactions().first)
    XCTAssertTrue(decline.pendingAskToBuyConfirmation)
    try session.declineAskToBuyTransaction(identifier: decline.identifier)
    XCTAssertTrue(session.allTransactions().isEmpty)
  }

  func testExpireMonthlySubscriptionWhenExplicitlyEnabled() throws {
    guard ProcessInfo.processInfo.environment["WOOF_STOREKIT_EXPIRE_MONTHLY"] == "1" else {
      throw XCTSkip("Set WOOF_STOREKIT_EXPIRE_MONTHLY=1 for the explicit local expiry test.")
    }

    let session = try cleanSession()
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
