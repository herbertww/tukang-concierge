import "dotenv/config";

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
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
  },

  stripe: {
    secretKey: optional("STRIPE_SECRET_KEY"),
    webhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
    serviceFeePrice: optional("STRIPE_SERVICE_FEE_PRICE_ID"),
    publicUrl: optional("PUBLIC_URL", "http://localhost:8000"),
  },
} as const;
