/** Shared domain types for Motman FX reference index. */

export type AssetCode =
  | "BANKAK_SDG"
  | "CASH_SDG"
  | "MTN_MOMO_RWF"
  | "BANK_RWF"
  | "USD"
  | "USDT"
  | "USDC";

export type PaymentRail =
  | "BANKAK"
  | "CASH"
  | "MTN_MOMO"
  | "BANK_RWF"
  | "CRYPTO";

export type TradeSide = "BUY" | "SELL";

export type SourceKind =
  | "COMPLETED_TRADE"
  | "BINDING_RFQ"
  | "P2P_AD"
  | "OFFICIAL_BANK"
  | "PARALLEL_MARKET"
  | "CALIBRATION_SAMPLE"
  | "SYNTHETIC_TEST";

export type SourceHealth = "LIVE" | "DELAYED" | "STALE" | "DOWN";

export type QuoteLabel =
  | "EXECUTABLE"
  | "ESTIMATED_NON_EXECUTABLE"
  | "NO_EXECUTABLE_LIQUIDITY";

export interface MoneyAmount {
  value: number;
  asset: AssetCode;
}

export interface PriceObservation {
  id: string;
  sourceId: string;
  sourceKind: SourceKind;
  traderAnonId?: string;
  assetBase: AssetCode;
  assetQuote: AssetCode;
  paymentRail: PaymentRail;
  side: TradeSide;
  price: number;
  quantity: number;
  totalAmount: number;
  fees?: number;
  city?: string;
  observedAt: string;
  executableUpTo: number;
  completionRate?: number;
  rating?: number;
  isSynthetic?: boolean;
}

export interface CompletedTradeRecord {
  tradeTime: string;
  asset: AssetCode;
  side: TradeSide;
  quantity: number;
  price: number;
  totalAmount: number;
  paymentMethod: PaymentRail;
  fees: number;
  status: "COMPLETED";
  traderAnonId: string;
  sourceId: string;
  city?: string;
  isSynthetic?: boolean;
}

export interface DepthLevel {
  price: number;
  quantity: number;
  traderAnonId: string;
  sourceId: string;
  sourceKind: SourceKind;
  completionRate?: number;
  rating?: number;
}

export interface ExecutableDepthResult {
  filled: boolean;
  vwap: number | null;
  filledQuantity: number;
  levelsUsed: number;
  independentTraders: number;
  availableLiquidity: number;
}

export interface CorridorQuoteRequest {
  amount: number;
  fromAsset: AssetCode;
  toAsset: AssetCode;
  fromRail: PaymentRail;
  toRail: PaymentRail;
  side?: TradeSide;
  city?: string;
  asOf?: string;
}

export interface CorridorMetrics {
  lastCompletedTrade: number | null;
  bid: number | null;
  ask: number | null;
  theoreticalRate: number | null;
  traderExpectedRate: number | null;
  spreadPct: number | null;
  grossDealerMarginPct: number | null;
  availableLiquidity: number;
  independentTraders: number;
  lastUpdatedAt: string | null;
  confidenceScore: number;
  sourceHealth: SourceHealth;
  quoteLabel: QuoteLabel;
  executableRange?: { low: number; high: number } | null;
  fairRate?: number | null;
  methodologyNote: string;
}

export interface CorridorQuoteResult {
  request: CorridorQuoteRequest;
  display: {
    amountLine: string;
    fairRateLine: string;
    executableLine: string;
    marginLine: string;
    confidenceLine: string;
    sourcesLine: string;
    updatedLine: string;
  };
  metrics: CorridorMetrics;
  legs: {
    sdgUsdtAsk: ExecutableDepthResult | null;
    rwfUsdtBid: ExecutableDepthResult | null;
  };
  warnings: string[];
  isCalibrationOnly?: boolean;
}

export interface GrossMarginBreakdown {
  sellPrice: number;
  buyPrice: number;
  grossMargin: number;
  grossMarginPct: number;
  labeledAs: "GROSS_ONLY" | "NET_ESTIMATE";
  netMargin?: number;
  missingCostItems: string[];
}

export interface AccuracySample {
  id: string;
  predictedPrice: number;
  actualCompletedPrice: number;
  corridor: string;
  amountBucket: "100k" | "500k" | "1m_plus";
  side: TradeSide;
  paymentRail: PaymentRail;
  traderAnonId: string;
  tradeTime: string;
  usedFutureData: boolean;
  isSynthetic: boolean;
}

export interface AccuracyReport {
  sampleCount: number;
  independentTraders: number;
  mape: number | null;
  medianErrorPct: number | null;
  p95ErrorPct: number | null;
  within10PctRate: number | null;
  acceptance: {
    minAccuracy90: boolean | null;
    mapeUnder2: boolean | null;
    medianUnder1_5: boolean | null;
    p95Under5: boolean | null;
  };
  disclaimer: string;
  excludedFutureLeakage: number;
  syntheticOnly: boolean;
}

export interface ProviderStatus {
  providerId: string;
  name: string;
  health: SourceHealth;
  lastSuccessAt: string | null;
  lastError?: string;
  lagSeconds?: number;
  isSoleFailurePoint: false;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export const MAX_TRADER_WEIGHT = 0.1;

export const SOURCE_WEIGHTS: Record<SourceKind, number> = {
  COMPLETED_TRADE: 1.0,
  BINDING_RFQ: 0.75,
  P2P_AD: 0.4,
  OFFICIAL_BANK: 0.15,
  PARALLEL_MARKET: 0.25,
  CALIBRATION_SAMPLE: 0,
  SYNTHETIC_TEST: 0,
};

export const STALE_THRESHOLD_SECONDS = 120;
export const DOWN_THRESHOLD_SECONDS = 600;
