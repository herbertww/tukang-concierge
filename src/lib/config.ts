import "dotenv/config";

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

/**
 * Qwen Cloud base URL, per the QwenCloud AI Hackathon guide:
 * - pay-as-you-go / free-tier keys (sk-...) → international DashScope endpoint
 * - Token Plan keys (sk-sp-...) → token-plan endpoint (mixing the two returns 401 InvalidApiKey)
 */
function qwenDefaultBaseUrl(): string {
  const key = process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";
  return key.startsWith("sk-sp-")
    ? "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    : "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
}

export const config = {
  port: parseInt(optional("PORT", "8000"), 10),
  nodeEnv: optional("NODE_ENV", "development"),
  dbPath: optional("DB_PATH", "./tukang.db"),

  mem0: {
    apiKey: optional("MEM0_API_KEY"),
    baseUrl: "https://api.mem0.ai/v1",
  },

  whatsapp: {
    token: optional("WHATSAPP_TOKEN"),
    phoneNumberId: optional("WHATSAPP_PHONE_NUMBER_ID"),
    verifyToken: optional("WHATSAPP_VERIFY_TOKEN", "tukang-verify"),
    baseUrl: "https://graph.facebook.com/v19.0",
    // Pre-approved utility template used for cold contractor outreach.
    outreachTemplate: optional("WHATSAPP_OUTREACH_TEMPLATE", "tukang_quote_request"),
    outreachTemplateLang: optional("WHATSAPP_OUTREACH_TEMPLATE_LANG", "en"),
  },

  stripe: {
    secretKey: optional("STRIPE_SECRET_KEY"),
    webhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
    serviceFeePrice: optional("STRIPE_SERVICE_FEE_PRICE_ID"),
    publicUrl: optional("PUBLIC_URL", "http://localhost:8000"),
  },

  qwen: {
    apiKey: optional("QWEN_API_KEY") || optional("DASHSCOPE_API_KEY"),
    baseUrl: optional("QWEN_BASE_URL", qwenDefaultBaseUrl()),
    model: optional("QWEN_MODEL", "qwen3.7-max"),
  },

  exa: {
    apiKey: optional("EXA_API_KEY"),
    // Search type: auto (balanced), fast, instant, deep-lite, deep, deep-reasoning
    searchType: optional("EXA_SEARCH_TYPE", "auto"),
  },
} as const;
