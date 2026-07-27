import { describe, expect, it } from "vitest";
import { formatQuoteMessage } from "./bot.js";

describe("telegram formatter", () => {
  it("includes non-executable warning text when present", () => {
    const msg = formatQuoteMessage({
      display: {
        amountLabel: "100,000 Bankak-SDG",
        fairPriceLabel: "السعر العادل: 25,588 RWF",
        executableRangeLabel: "لا يوجد سعر تنفيذي حالياً",
        marginLabel: "الهامش: 1.5%",
        confidenceLabel: "الثقة: 82/100",
        sourcesLabel: "المصادر المستقلة: 14",
        lastUpdateLabel: "آخر تحديث: منذ 8 ثوانٍ",
      },
      components: {
        rateLabel: "NO_EXECUTABLE_LIQUIDITY",
        confidence: 82,
        sourceStatus: "LIVE",
        methodologyNote: "لا يوجد سعر تنفيذي حالياً",
      },
    });
    expect(msg).toContain("لا يوجد سعر تنفيذي حالياً");
    expect(msg).toContain("موتمن");
  });
});
