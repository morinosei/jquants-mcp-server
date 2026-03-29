const JQUANTS_API_KEY = process.env.JQUANTS_API_KEY || "";
const BASE = "https://api.jquants.com/v2";

async function jq(path: string, params: Record<string, string> = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { "x-api-key": JQUANTS_API_KEY } });
  if (!res.ok) throw new Error(`J-Quants API error: ${res.status} ${await res.text()}`);
  return res.json();
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "N/A";
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "兆円";
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + "億円";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + "万円";
  return n.toLocaleString() + "円";
}

const TOOLS = [
  { name: "get_api_key_status", description: "J-Quants APIキーが設定されているか確認します", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "search_company", description: "企業名または銘柄コードで日本の上場企業を検索します。例: 'トヨタ', 'ソニー', '7203'", inputSchema: { type: "object", properties: { query: { type: "string", description: "企業名または銘柄コード" } }, required: ["query"] } },
  { name: "get_company_info", description: "銘柄コードで企業の基本情報を取得します", inputSchema: { type: "object", properties: { code: { type: "string", description: "銘柄コード（例: 7203）" } }, required: ["code"] } },
  { name: "get_financial_statements", description: "企業の決算短信（売上・営業利益・純利益・EPS・配当等）を取得します", inputSchema: { type: "object", properties: { code: { type: "string", description: "銘柄コード（例: 7203）" }, date: { type: "string", description: "開示日 YYYY-MM-DD（省略時は最新）" } }, required: ["code"] } },
  { name: "get_stock_price", description: "企業の株価（始値・高値・安値・終値・出来高）を取得します", inputSchema: { type: "object", properties: { code: { type: "string", description: "銘柄コード（例: 7203）" }, date_from: { type: "string", description: "開始日 YYYY-MM-DD" }, date_to: { type: "string", description: "終了日 YYYY-MM-DD" } }, required: ["code"] } },
  { name: "get_dividend_info", description: "企業の配当金情報を取得します", inputSchema: { type: "object", properties: { code: { type: "string", description: "銘柄コード（例: 7203）" } }, required: ["code"] } },
  { name: "get_earnings_calendar", description: "決算発表予定日の一覧を取得します", inputSchema: { type: "object", properties: { date: { type: "string", description: "日付 YYYY-MM-DD（省略時は今日）" } }, required: [] } },
];

async function handleTool(name: string, args: Record<string, string>): Promise<string> {
  if (!JQUANTS_API_KEY) return "❌ J-Quants APIキーが設定されていません。";
  switch (name) {
    case "get_api_key_status":
      return `✅ J-Quants APIキーが設定されています（末尾4桁: ...${JQUANTS_API_KEY.slice(-4)})`;
    case "search_company": {
      const data: any = await jq("/listed/info");
      const q = args.query?.toLowerCase() || "";
      const results = (data.info || []).filter((c: any) =>
        c.CompanyName?.toLowerCase().includes(q) ||
        c.CompanyNameEnglish?.toLowerCase().includes(q) ||
        c.Code?.startsWith(q)
      ).slice(0, 10);
      if (results.length === 0) return `❌ "${args.query}" に一致する企業が見つかりませんでした。`;
      return `🔍 "${args.query}" の検索結果 ${results.length}件\n\n` +
        results.map((c: any) =>
          `🏢 ${c.CompanyName} (${c.CompanyNameEnglish || ""})\n   銘柄コード: ${c.Code} | 業種: ${c.Sector33CodeName || "N/A"}`
        ).join("\n\n");
    }
    case "get_company_info": {
      const data: any = await jq("/listed/info", { code: args.code });
      const c = (data.info || [])[0];
      if (!c) return `❌ 銘柄コード ${args.code} の企業が見つかりませんでした。`;
      return [
        `🏢 ${c.CompanyName}`,
        `📋 英語名: ${c.CompanyNameEnglish || "N/A"}`,
        `📊 銘柄コード: ${c.Code}`,
        `🏦 市場区分: ${c.MarketProductCategory || "N/A"}`,
        `🏭 業種(33業種): ${c.Sector33CodeName || "N/A"}`,
        `🏭 業種(17業種): ${c.Sector17CodeName || "N/A"}`,
        `📅 上場日: ${c.ListingDate || "N/A"}`,
        `💴 規模区分: ${c.ScaleCategory || "N/A"}`,
      ].join("\n");
    }
    case "get_financial_statements": {
      const params: Record<string, string> = { code: args.code };
      if (args.date) params.date = args.date;
      const data: any = await jq("/fins/statements", params);
      const stmts: any[] = (data.statements || []).slice(0, 5);
      if (stmts.length === 0) return `❌ 銘柄コード ${args.code} の財務情報が見つかりませんでした。`;
      return `📊 ${args.code} 決算情報（直近${stmts.length}件）\n\n` +
        stmts.map((s: any) => [
          `📅 開示日: ${s.DisclosureDate || "N/A"} | 決算期: ${s.FiscalYear || "N/A"}年`,
          `💰 売上高: ${fmt(s.NetSales)}`,
          `📈 営業利益: ${fmt(s.OperatingProfit)}`,
          `📈 経常利益: ${fmt(s.OrdinaryProfit)}`,
          `💵 純利益: ${fmt(s.NetIncome)}`,
          `📊 EPS: ${s.EarningsPerShare != null ? s.EarningsPerShare + "円" : "N/A"}`,
          `💴 配当: ${s.DividendPerShare != null ? s.DividendPerShare + "円" : "N/A"}`,
        ].join("\n")).join("\n\n──────────────────────\n\n");
    }
    case "get_stock_price": {
      const from = args.date_from || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const to = args.date_to || new Date().toISOString().split("T")[0];
      const data: any = await jq("/prices/daily_quotes", { code: args.code, dateFrom: from, dateTo: to });
      const prices: any[] = (data.daily_quotes || []).slice(-10).reverse();
      if (prices.length === 0) return `❌ 銘柄コード ${args.code} の株価データが見つかりませんでした。`;
      return `📈 ${args.code} 株価情報（直近${prices.length}日）\n\n` +
        prices.map((p: any) =>
          `📅 ${p.Date} | 始: ${p.Open?.toLocaleString()}円 高: ${p.High?.toLocaleString()}円 安: ${p.Low?.toLocaleString()}円 終: ${p.Close?.toLocaleString()}円 | 出来高: ${p.Volume?.toLocaleString()}`
        ).join("\n");
    }
    case "get_dividend_info": {
      const data: any = await jq("/fins/dividend", { code: args.code });
      const divs: any[] = (data.dividend || []).slice(0, 5);
      if (divs.length === 0) return `❌ 銘柄コード ${
