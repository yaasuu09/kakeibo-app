export type ExpenseFormData = {
  date: string; // YYYY-MM-DD
  payer: "泰孝" | "沙紀";
  amount: number;
  category: string;
  store: string;
  memo: string;
};

export type Payload = [
  string,  // ID
  string,  // 日付
  number | string, // 泰孝立替
  number | string, // 沙紀立替
  string,  // カテゴリ
  string,  // 購入先
  string,  // 備考
  boolean  // 精算済
];

/**
 * Returns today's date formatted as YYYY-MM-DD in JST.
 */
export function getTodayJST(): string {
  const d = new Date();
  // Adjust to JST (UTC+9)
  const jstDate = new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000);
  const year = jstDate.getFullYear();
  const month = String(jstDate.getMonth() + 1).padStart(2, "0");
  const day = String(jstDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validates and formats the payload according to business rules.
 */
export function formatPayload(data: ExpenseFormData): Payload {
  if (!data.amount || !data.category) {
    throw new Error("Amount and Category are required.");
  }

  // Generate ID
  const random4 = Math.floor(1000 + Math.random() * 9000).toString();
  const id = `${data.date}-${random4}`;

  // Apply Business Logic
  let processedAmount = data.amount;
  let settled = false;

  if (data.category === "泰雅立替") {
    settled = false;
  } else if (data.category === "泰雅財布入金") {
    processedAmount = processedAmount * -1;
    settled = true;
  } else if (data.category === "泰雅精算ログ") {
    settled = true;
  } else {
    settled = false;
  }

  // Payer amounts
  const yasutakaPaid = data.payer === "泰孝" ? processedAmount : "";
  const sakiPaid = data.payer === "沙紀" ? processedAmount : "";

  return [
    id,
    data.date,
    yasutakaPaid,
    sakiPaid,
    data.category,
    data.store,
    data.memo,
    settled,
  ];
}
