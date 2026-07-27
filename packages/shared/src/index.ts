/** Shared domain types for Motman FX Index */

export type Corridor =
  | "Bankak-SDG"
  | "Cash-SDG"
  | "MTN-MoMo-RWF"
  | "Bank-RWF";

export type IntermediateAsset = "USD" | "USDT" | "USDC";

export type TradeSide = "BUY" | "SELL";

export type PaymentMethod =
  | "BANKAK"
  | "CASH_SDG"
  | "MTN_MOMO"
  | "BANK_RWF"
  | "OTHER";

export type SourceStatus = "LIVE" | "STALE" | "DOWN";

export type QuoteKind =
  | "COMPLETED_TRADE"
  | "BINDING_RFQ"
  | "ADVERTISEMENT"
  | "OFFICIAL_REFERENCE"
  | "PARALLEL_MARKET"
  | "CALIBRATION_SAMPLE"
  | "SYNTHETIC_TEST";

export type RateLabel =
  | "EXECUTABLE"
  | "ESTIMATED_NON_EXECUTABLE"
  | "NO_EXECUTABLE_LIQUIDITY";

export interface AnonymizedTrade {
  /** Opaque encrypted merchant id — never PII */
  anonymousMerchantId: string;
  completedAt: string; // ISO
  asset: IntermediateAsset | "SDG" | "RWF";
  quoteAsset: IntermediateAsset | "SDG" | "RWF";
  side: TradeSide;
  quantity: number;
  price: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  fees: number;
  status: "COMPLETED";
  corridor: Corridor;
  city?: string;
  source: string;
  kind: QuoteKind;
}

export interface MarketQuote {
  id: string;
  source: string;
  kind: QuoteKind;
  corridor: Corridor;
  intermediate: IntermediateAsset;
  side: TradeSide;
  price: number;
  availableAmount: number;
  minAmount: number;
  maxAmount: number;
  paymentMethod: PaymentMethod;
  merchantId: string;
  merchantCompletionRate?: number;
  merchantRating?: number;
  city?: string;
  observedAt: string;
  isBinding: boolean;
}

export interface QuoteRequest {
  amount: number;
  fromCorridor: Corridor;
  toCorridor: Corridor;
  intermediate?: IntermediateAsset;
  city?: string;
  side?: TradeSide;
}

export interface RateComponents {
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
  confidence: number; // 0-100
  sourceStatus: SourceStatus;
  rateLabel: RateLabel;
  executableLow: number | null;
  executableHigh: number | null;
  fairPrice: number | null;
  methodologyNote: string;
}

export interface PricingResult {
  request: QuoteRequest;
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
  components: RateComponents;
  auditId: string;
}

export interface GrossMarginBreakdown {
  sellPrice: number;
  buyPrice: number;
  grossMargin: number;
  grossMarginPct: number;
  label: "تقديرًا — ربح إجمالي فقط" | "ربح إجمالي";
}

export interface NetMarginBreakdown extends GrossMarginBreakdown {
  binanceFees?: number;
  bankakFees?: number;
  mobileMoneyFees?: number;
  liquidityCosts?: number;
  cashOutPremium?: number;
  inventoryRisk?: number;
  disputeLosses?: number;
  netMargin?: number;
  netAvailable: boolean;
  note: string;
}

export interface AccuracySample {
  predictedPrice: number;
  actualCompletedPrice: number;
  completedAt: string;
  amountBucket: "100k" | "500k" | "1m+" | "other";
  corridorPair: string;
  side: TradeSide;
  isSynthetic: boolean;
}

export interface AccuracyReport {
  sampleCount: number;
  independentMerchants: number;
  mape: number;
  medianError: number;
  p95Error: number;
  pctWithin10: number;
  meetsMinimum90: boolean;
  meetsTargetMape2: boolean;
  meetsMedian1_5: boolean;
  meetsP95_5: boolean;
  definition: string;
  caveats: string[];
}

export const MAX_MERCHANT_WEIGHT = 0.1;

export const SOURCE_STALE_MS: Record<string, number> = {
  binance_p2p: 5 * 60 * 1000,
  completed_trades: 30 * 60 * 1000,
  binding_rfq: 2 * 60 * 1000,
  official_bok: 24 * 60 * 60 * 1000,
  official_bnr: 24 * 60 * 60 * 1000,
  parallel_market: 60 * 60 * 1000,
};
