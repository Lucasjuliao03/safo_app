module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    hasMP: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
    hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    appUrl: process.env.APP_URL || "NOT SET",
    node: process.version,
  });
};
