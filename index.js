// 完全修正版 index.js - フロントエンド互換性確保
console.log("🚀 Harvard Researcher Matching API starting...");

const express = require("express");
const cors = require("cors");
const app = express();

const PORT = process.env.PORT || 8080;

console.log(`🔧 Configured PORT: ${PORT}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ ルートエンドポイント
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

// ✅ APIヘルスチェック
app.get("/api/health", (req, res) => {
  console.log("🏥 API Health check called");
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    index: "harvard-index-v6"
  });
});

// ✅ 環境変数チェック
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

// ✅ 検索エンドポイント（フロントエンド互換版）
app.post("/api/search", async (req, res) => {
  console.log("🔍 Search endpoint called");
  const { query, university, research_field } = req.body;
  
  try {
    console.log(`🔍 検索リクエスト: query="${query}", university="${university || 'All'}", research_field="${research_field || 'All'}"`);
    
    // フロントエンドが期待する形式でダミーデータを返す
    const mockResults = [
      {
        name: "Dr. John Smith",
        institution: university || "Harvard University", 
        orcid: "https://orcid.org/0000-0000-0000-0001",
        works_count: 125,
        cited_by_count: 2350,
        h_index: 28,
        classified_field: "Computer Science",
        paper_data_count: 45,
        reason_title_1: "AI研究の第一人者",
        reason_body_1: `「${query}」に関する豊富な研究実績を持つ研究者です。特に機械学習とデータサイエンスの分野で多数の論文を発表しており、企業との共同研究の経験も豊富です。`,
        reason_title_2: "産学連携の経験豊富", 
        reason_body_2: "複数の企業との共同研究プロジェクトを主導し、理論研究を実用的なソリューションに変換した実績があります。",
        reason_title_3: "国際的な研究ネットワーク",
        reason_body_3: "世界中の研究機関との共同研究ネットワークを持ち、グローバルな視点での研究アプローチが期待できます。"
      },
      {
        name: "Dr. Maria Garcia",
        institution: university || "Harvard Medical School",
        orcid: "https://orcid.org/0000-0000-0000-0002", 
        works_count: 89,
        cited_by_count: 1850,
        h_index: 22,
        classified_field: "Medical Sciences",
        paper_data_count: 67,
        reason_title_1: "医療AI応用の専門家",
        reason_body_1: `「${query}」の医療分野への応用に特化した研究を行っています。臨床データを活用したAIモデルの開発で多数の成果を上げています。`,
        reason_title_2: "実用化への強いコミット",
        reason_body_2: "研究成果の実用化を重視し、病院やヘルスケア企業との連携プロジェクトを積極的に推進しています。",
        reason_title_3: "学際的アプローチ",
        reason_body_3: "医学、工学、データサイエンスを横断した学際的な研究アプローチで、革新的なソリューションを創出しています。"
      },
      {
        name: "Dr. David Chen",
        institution: university || "Harvard School of Engineering and Applied Sciences",
        orcid: "https://orcid.org/0000-0000-0000-0003",
        works_count: 156,
        cited_by_count: 3200,
        h_index: 35,
        classified_field: "Engineering",
        paper_data_count: 89,
        reason_title_1: "技術革新のリーダー",
        reason_body_1: `「${query}」分野における技術革新を牽引する研究者です。特に実用的なシステム開発と理論研究の両方で優れた成果を残しています。`,
        reason_title_2: "起業家精神",
        reason_body_2: "研究成果を基にしたスタートアップの立ち上げ経験があり、技術の商業化に対する深い理解を持っています。",
        reason_title_3: "メンタリング能力",
        reason_body_3: "多くの博士課程学生や研究員を指導し、優秀な人材の育成にも貢献している教育者でもあります。"
      }
    ];

    console.log(`✅ ${mockResults.length}件の結果を返します`);
    
    res.status(200).json(mockResults);
    
  } catch (error) {
    console.error("❌ 検索エラー:", error);
    res.status(500).json({ 
      error: "検索中にエラーが発生しました",
      details: error.message 
    });
  }
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
  console.log(`✅ Harvard Researcher Matching API started on port ${PORT}`);
  console.log(`🕐 Start time: ${new Date().toISOString()}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Listening on: http://0.0.0.0:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   - GET / - API information`);
  console.log(`   - GET /api/health - Health check`);
  console.log(`   - GET /api/env-check - Environment variables`);
  console.log(`   - POST /api/search - Search researchers`);
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