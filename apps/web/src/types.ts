export type Corridor = "Bankak-SDG" | "Cash-SDG" | "MTN-MoMo-RWF" | "Bank-RWF";

export interface PricingResult {
  request: {
    amount: number;
    fromCorridor: Corridor;
    toCorridor: Corridor;
  };
  display: {
    amountLabel: string;
    fairPriceLabel: string;
    executableRangeLabel: string;
    marginLabel: string;
    confidenceLabel: string;
    sourcesLabel: string;
    lastUpdateLabel: string;
    liquidityWarning?: string;
  };
  components: {
    lastCompletedTrade: number | null;
    bid: number | null;
    ask: number | null;
    theoretical: number | null;
    traderExpected: number | null;
    spread: number | null;
    grossDealerMargin: number | null;
    availableLiquidity: number;
    independentMerchants: number;
    lastUpdatedAt: string | null;
    confidence: number;
    sourceStatus: "LIVE" | "STALE" | "DOWN";
    rateLabel: "EXECUTABLE" | "ESTIMATED_NON_EXECUTABLE" | "NO_EXECUTABLE_LIQUIDITY";
    executableLow: number | null;
    executableHigh: number | null;
    fairPrice: number | null;
    methodologyNote: string;
  };
  auditId: string;
}
