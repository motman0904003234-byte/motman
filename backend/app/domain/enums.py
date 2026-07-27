from enum import Enum


class Rail(str, Enum):
    BANKAK_SDG = "Bankak-SDG"
    CASH_SDG = "Cash-SDG"
    MTN_MOMO_RWF = "MTN-MoMo-RWF"
    BANK_RWF = "Bank-RWF"
    USD = "USD"
    USDT = "USDT"
    USDC = "USDC"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class QuoteKind(str, Enum):
    COMPLETED_TRADE = "COMPLETED_TRADE"
    BINDING_RFQ = "BINDING_RFQ"
    PUBLIC_AD = "PUBLIC_AD"
    OFFICIAL = "OFFICIAL"
    PARALLEL_MARKET = "PARALLEL_MARKET"
    SYNTHETIC_TEST = "SYNTHETIC_TEST"
    CALIBRATION_SEED = "CALIBRATION_SEED"


class SourceStatus(str, Enum):
    LIVE = "LIVE"
    STALE = "STALE"
    DOWN = "DOWN"


class RateLabel(str, Enum):
    EXECUTABLE = "EXECUTABLE"
    ESTIMATED_NON_EXECUTABLE = "ESTIMATED_NON_EXECUTABLE"
    NO_EXECUTABLE_LIQUIDITY = "NO_EXECUTABLE_LIQUIDITY"


class City(str, Enum):
    KHARTOUM = "Khartoum"
    KIGALI = "Kigali"
    UNKNOWN = "Unknown"