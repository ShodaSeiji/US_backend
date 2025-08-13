// 緊急修正版 index.js - 現在の問題を解決
console.log("🚀 Starting application...");

const express = require("express");
const cors = require("cors");
const app = express();

// ⚠️ 重要: Azure App ServiceはPORT環境変数を使用
const PORT = process.env.PORT || 8080;

console.log(`🔧 Configured PORT: ${PORT}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ ルートエンドポイント（これが404になっている）
app.get("/", (req, res) => {
  console.log("📞 Root endpoint called");
  res.status(200).json({ 
    status: "Server is running", 
    message: "Harvard Researcher Matching API - Backend",
    timestamp: new Date().toISOString(),
    port: PORT,
    nodeVersion: process.version,
    endpoints: [
      "GET / - This endpoint",
      "GET /api/health - Health check", 
      "GET /api/env-check - Environment variables check",
      "POST /api/search - Search researchers"
    ]
  });
});

// ✅ Azure App Service用ヘルスプローブ
app.get("/health", (req, res) => {
  console.log("🏥 Health probe called");
  res.status(200).send("OK");
});

// ✅ APIヘルスチェック（これは動作している）
app.get("/api/health", (req, res) => {
  console.log("🏥 API Health check called");
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    index: "harvard-index-v6"
  });
});

// ✅ 環境変数チェック（これが404になっている）
app.get("/api/env-check", (req, res) => {
  console.log("🔍 Environment check called");
  
  const envStatus = {
    AZURE_SEARCH_ENDPOINT: process.env.AZURE_SEARCH_ENDPOINT ? 'SET' : 'MISSING',
    AZURE_SEARCH_API_KEY: process.env.AZURE_SEARCH_API_KEY ? 'SET' : 'MISSING',
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY ? 'SET' : 'MISSING',
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'MISSING',
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ? 'SET' : 'MISSING',
    AZURE_OPENAI_GPT_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_GPT_DEPLOYMENT_NAME ? 'SET' : 'MISSING'
  };

  const allSet = Object.values(envStatus).every(status => status === 'SET');

  res.status(200).json({
    status: "Environment Variables Check",
    variables: envStatus,
    allConfigured: allSet,
    nodeVersion: process.version,
    platform: process.platform,
    port: PORT
  });
});

// ✅ 簡単な検索エンドポイント（テスト用）
app.post("/api/search", (req, res) => {
  console.log("🔍 Search endpoint called");
  const { query, university, research_field } = req.body;
  
  res.status(200).json({
    message: "Search endpoint is working",
    query: query || "No query provided",
    university: university || "All",
    research_field: research_field || "All",
    timestamp: new Date().toISOString(),
    note: "This is a simplified test response. Full functionality will be restored."
  });
});

// ✅ 404ハンドリング
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: "Endpoint not found",
    method: req.method,
    url: req.url,
    availableEndpoints: [
      "GET /",
      "GET /api/health", 
      "GET /api/env-check",
      "POST /api/search"
    ]
  });
});

// ✅ エラーハンドリング
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ✅ サーバー起動
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server successfully started on port ${PORT}`);
  console.log(`🕐 Start time: ${new Date().toISOString()}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Listening on: http://0.0.0.0:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   - GET /`);
  console.log(`   - GET /api/health`);
  console.log(`   - GET /api/env-check`);
  console.log(`   - POST /api/search`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});