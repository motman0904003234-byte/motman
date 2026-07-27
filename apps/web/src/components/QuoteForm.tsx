import { useState, type FormEvent } from "react";
import type { Corridor } from "../types";

const corridorsFrom: Corridor[] = ["Bankak-SDG", "Cash-SDG"];
const corridorsTo: Corridor[] = ["MTN-MoMo-RWF", "Bank-RWF"];

export function QuoteForm({
  onSubmit,
  busy,
}: {
  onSubmit: (v: {
    amount: number;
    fromCorridor: Corridor;
    toCorridor: Corridor;
    city?: string;
  }) => void;
  busy: boolean;
}) {
  const [amount, setAmount] = useState("100000");
  const [fromCorridor, setFrom] = useState<Corridor>("Bankak-SDG");
  const [toCorridor, setTo] = useState<Corridor>("MTN-MoMo-RWF");
  const [city, setCity] = useState("");

  function handle(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      amount: Number(amount.replace(/,/g, "")),
      fromCorridor,
      toCorridor,
      city: city || undefined,
    });
  }

  return (
    <form className="form" onSubmit={handle}>
      <label>
        المبلغ
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      <label>
        العملة الأصلية / المسار
        <select
          value={fromCorridor}
          onChange={(e) => setFrom(e.target.value as Corridor)}
        >
          {corridorsFrom.map((c) => (
            <option key={c} value={c}>
              {c === "Bankak-SDG" ? "بنكك SDG" : "نقد SDG"}
            </option>
          ))}
        </select>
      </label>
      <label>
        العملة المطلوبة / المسار
        <select
          value={toCorridor}
          onChange={(e) => setTo(e.target.value as Corridor)}
        >
          {corridorsTo.map((c) => (
            <option key={c} value={c}>
              {c === "MTN-MoMo-RWF" ? "MTN MoMo RWF" : "بنك رواندي RWF"}
            </option>
          ))}
        </select>
      </label>
      <label>
        المدينة (اختياري)
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="الخرطوم / كيغالي"
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "جارٍ الحساب…" : "احسب السعر"}
      </button>
    </form>
  );
}
