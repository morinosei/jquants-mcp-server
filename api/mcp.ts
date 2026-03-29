const JQUANTS_API_KEY = process.env.JQUANTS_API_KEY || "";
const BASE = "https://api.jquants.com/v2";

async function jq(path: string, params: Record<string, string> = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  const res = await fetch(url.toString(), { headers: { "x-api-key": JQUANTS_API_KEY } });
  const text = await res.text();
  if (!res.ok) throw new Error(`J-Quants error ${res.status}: ${text}`);
  return JSON.parse(text);
}

function fmt(n: any): string {
  if (n == null || n === "") return "N/A";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (Math.abs(num) >= 1e12) return (num / 1e12).toFixed(2) + "兆円";
  if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(2) + "億円";
  if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(2) + "万円";
  return num.toLocaleString() + "円";
}

const TOOLS = [
  { name: "get_api_key_status", description: "J-Quants APIキーが設定されているか確認します", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "search_company", description: "企業名または銘柄コードで日本の上場企業を検索します。例: 'トヨタ', 'ソニー', '7203'", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_company_info", description: "銘柄コードで企業の基本情報を取得します", inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } },
  { name: "get_financial_statements", description: "企業の決算情報（売上・営業利益・純利益・EPS・配当等）を取得します", inputSchema: { type: "object", properties: { code: { type: "string" }, date: { type: "string" } }, required: ["code"] } },
  { name: "get_stock_price", description: "企業の株価を取得します", inputSchema: { type: "object", properties: { code: { type: "string" }, date_from: { type: "string" }, date_to: { type: "string" } }, required: ["code"] } },
  { name: "get_dividend_info", description: "企業の配当金情報を取得します", inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } },
  { name: "get_earnings_calendar", description: "決算発表予定日の一覧を取得します", inputSchema: { type: "object", properties: { date: { type: "string" } }, required: [] } },
];

async function handleTool(name: string, args: any): Promise<string> {
  if (!JQUANTS_API_KEY) return "❌ JQUANTS_API_KEYが設定されていません。";
  try {
    switch (name) {
      case "get_api_key_status":
        return `✅ J-Quants APIキー設定済み（末尾4桁: ...${JQUANTS_API_KEY.slice(-4)})`;
      case "search_company": {
        const data: any = await jq("/listed/info");
        const q = (args.query || "").toLowerCase();
        const results = (data.info || []).filter((c: any) =>
          (c.CompanyName || "").toLowerCase().includes(q) ||
          (c.CompanyNameEnglish || "").toLowerCase().includes(q) ||
          (c.Code || "").startsWith(q)
        ).slice(0, 10);
        if (!results.length) return `❌ "${args.query}" に一致する企業が見つかりませんでした。`;
        return `🔍 "${args.query}" の検索結果 ${results.length}件\n\n` +
          results.map((c: any) =>
            `🏢 ${c.CompanyName} (${c.CompanyNameEnglish || ""})\n   銘柄コード: ${c.Code} | 業種: ${c.Sector33CodeName || "N/A"}`
          ).join("\n\n");
      }
      case "get_company_info": {
        const data: any = await jq("/listed/info", { code: args.code });
        const c = (data.info || [])[0];
        if (!c) return `❌ 銘柄コード ${args.code} が見つかりませんでした。`;
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
        const params: any = { code: args.code };
        if (args.date) params.date = args.date;
        const data: any = await jq("/fins/statements", params);
        const stmts = (data.statements || []).slice(0, 5);
        if (!stmts.length) return `❌ 銘柄コード ${args.code} の財務情報が見つかりませんでした。`;
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
        const prices = (data.daily_quotes || []).slice(-10).reverse();
        if (!prices.length) return `❌ 銘柄コード ${args.code} の株価データが見つかりませんでした。`;
        return `📈 ${args.code} 株価情報（直近${prices.length}日）\n\n` +
          prices.map((p: any) =>
            `📅 ${p.Date} | 始: ${p.Open?.toLocaleString()}円 高: ${p.High?.toLocaleString()}円 安: ${p.Low?.toLocaleString()}円 終: ${p.Close?.toLocaleString()}円 | 出来高: ${p.Volume?.toLocaleString()}`
          ).join("\n");
      }
      case "get_dividend_info": {
        const data: any = await jq("/fins/dividend", { code: args.code });
        const divs = (data.dividend || []).slice(0, 5);
        if (!divs.length) return `❌ 銘柄コード ${args.code} の配当情報が見つかりませんでした。`;
        return `💴 ${args.code} 配当情報\n\n` +
          divs.map((d: any) =>
            `📅 開示日: ${d.DisclosureDate || "N/A"} | 決算期: ${d.FiscalYear || "N/A"}年`
          ).join("\n\n──────────────────────\n\n");
      }
      case "get_earnings_calendar": {
        const date = args.date || new Date().toISOString().split("T")[0];
        const data: any = await jq("/fins/announcement", { date });
        const items = (data.announcement || []).slice(0, 20);
        if (!items.length) return `❌ ${date} の決算発表予定が見つかりませんでした。`;
        return `📅 ${date} 決算発表予定 ${items.length}件\n\n` +
          items.map((a: any) => `🏢 ${a.CompanyName || a.Code} (${a.Code})`).join("\n");
      }
      default: return `Unknown tool: ${name}`;
    }
  } catch (e: any) {
    return `❌ エラー: ${e.message}`;
  }
}

module.exports = async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = req.body;
  if (!body) return res.status(400).json({ error: "No body" });
  if (body.method === "initialize") return res.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "jquants-mcp-server", version: "1.0.0" } } });
  if (body.method === "tools/list") return res.json({ jsonrpc: "2.0", id: body.id, result: { tools: TOOLS } });
  if (body.method === "tools/call") {
    const text = await handleTool(body.params?.name || "", body.params?.arguments || {});
    return res.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text }] } });
  }
  return res.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
};
