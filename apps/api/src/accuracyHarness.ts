import { evaluateAccuracy, percentageError } from "@motman/core";
import type { AccuracySample } from "@motman/shared";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Accuracy harness.
 * Real completed trades must be supplied via data/real-completed-trades.json
 * Synthetic samples are for software regression only and NEVER prove accuracy.
 */
function main() {
  const realPath = path.resolve(__dirname, "../../../data/calibration/real-completed-trades.json");
  const syntheticPath = path.resolve(__dirname, "../../../data/synthetic/software-only-samples.json");

  let real: AccuracySample[] = [];
  if (fs.existsSync(realPath)) {
    const parsed = JSON.parse(fs.readFileSync(realPath, "utf8")) as
      | AccuracySample[]
      | { trades?: AccuracySample[] };
    const list = Array.isArray(parsed) ? parsed : (parsed.trades ?? []);
    real = list.map((s) => ({ ...s, isSynthetic: false }));
  }

  let synthetic: AccuracySample[] = [];
  if (fs.existsSync(syntheticPath)) {
    synthetic = JSON.parse(fs.readFileSync(syntheticPath, "utf8")) as AccuracySample[];
    synthetic = synthetic.map((s) => ({ ...s, isSynthetic: true }));
  } else {
    // Generate software-only walk-forward synthetic for pipeline test
    synthetic = Array.from({ length: 50 }, (_, i) => {
      const actual = 25000 + i * 10;
      const predicted = actual * (1 + ((i % 7) - 3) / 1000);
      return {
        predictedPrice: predicted,
        actualCompletedPrice: actual,
        completedAt: `2026-06-${String((i % 27) + 1).padStart(2, "0")}T12:00:00Z`,
        amountBucket: i % 3 === 0 ? "100k" : i % 3 === 1 ? "500k" : "1m+",
        corridorPair: "Bankak-SDG>MTN-MoMo-RWF",
        side: i % 2 === 0 ? "BUY" : "SELL",
        isSynthetic: true,
      } satisfies AccuracySample;
    });
    fs.mkdirSync(path.dirname(syntheticPath), { recursive: true });
    fs.writeFileSync(syntheticPath, JSON.stringify(synthetic, null, 2));
  }

  const report = evaluateAccuracy([...real, ...synthetic]);
  const softwareCheck = evaluateAccuracy(
    synthetic.map((s) => ({ ...s, isSynthetic: false }))
  );

  const out = {
    definition: report.definition,
    examplePercentageError: percentageError(25_200, 25_587.78),
    realDataReport: report,
    softwarePipelineCheck_NOT_FOR_CLAIMS: {
      ...softwareCheck,
      warning: "اصطناعي بالكامل — لاختبار البرمجيات فقط",
    },
    missingForAcceptance: [
      real.length < 300
        ? `بحاجة إلى ${300 - real.length} صفقة مكتملة حقيقية إضافية`
        : null,
      "≥ 10 تجار مستقلين مع موصل محلي (مفاتيح لا تغادر الجهاز)",
      "تقسيم زمني walk-forward على Bankak و MTN MoMo واتجاهي الشراء/البيع",
      "فئات 100k / 500k / 1m+",
    ].filter(Boolean),
    howToCollectSafely: [
      "شغّل apps/trader-connector محلياً بصلاحية قراءة Binance C2C Trade History فقط",
      "ارفع الحقول المسموحة فقط: وقت، عملة، اتجاه، كمية، سعر، إجمالي، طريقة دفع، رسوم، COMPLETED، معرف مشفّر",
      "لا تطلب سحب أو أوامر أو اسم/هاتف/حساب/PIN/OTP",
      "POST إلى /v1/ingest/trades ثم أعد تشغيل pnpm accuracy",
    ],
  };

  const reportPath = path.resolve(__dirname, "../../../docs/ACCURACY_REPORT.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nWrote ${reportPath}`);

  if (report.sampleCount < 300) {
    console.log(
      "\n⚠️  لا يُدَّعى تحقيق معايير الدقة — بيانات صفقات حقيقية غير كافية."
    );
    process.exitCode = 0; // system complete; accuracy claim withheld
  }
}

main();
