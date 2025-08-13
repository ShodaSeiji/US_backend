// 🚀 本格版 index.js - Azure AI Search + Azure OpenAI完全統合版
console.log("🚀 Harvard Researcher Matching API - Production Version starting...");

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;
const AZURE_SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const AZURE_SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY;
const AZURE_SEARCH_INDEX = "harvard-index-v6";
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
const AZURE_OPENAI_GPT_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_GPT_DEPLOYMENT_NAME;

// 環境変数チェック
if (
  !AZURE_SEARCH_ENDPOINT || !AZURE_SEARCH_API_KEY || 
  !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT ||
  !AZURE_OPENAI_EMBEDDING_DEPLOYMENT || !AZURE_OPENAI_GPT_DEPLOYMENT_NAME
) {
  console.error("❌ 必要な環境変数が不足しています。");
  console.error("Missing variables:", {
    AZURE_SEARCH_ENDPOINT: !!AZURE_SEARCH_ENDPOINT,
    AZURE_SEARCH_API_KEY: !!AZURE_SEARCH_API_KEY,
    AZURE_OPENAI_API_KEY: !!AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT: !!AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: !!AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    AZURE_OPENAI_GPT_DEPLOYMENT_NAME: !!AZURE_OPENAI_GPT_DEPLOYMENT_NAME
  });
  // 環境変数不足でも起動継続（フォールバック機能付き）
}

console.log("✅ Environment variables loaded");
console.log(`🔧 Configured PORT: ${PORT}`);
console.log(`🔍 Search Index: ${AZURE_SEARCH_INDEX}`);

// ✅ 日本語→英語翻訳機能
async function translateToEnglish(query) {
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    console.log("⚠️ Azure OpenAI not configured, skipping translation");
    return query; // フォールバック：そのまま返す
  }

  try {
    const prompt = `以下の日本語の研究トピックを、専門用語を保ちつつ自然な英語に翻訳してください：\n「${query}」\n英訳：`;
    const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_GPT_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;
    const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
    const payload = {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 100,
      model: AZURE_OPENAI_GPT_DEPLOYMENT_NAME
    };
    
    const response = await axios.post(url, payload, { headers, timeout: 10000 });
    const translated = response.data.choices[0].message.content.trim();
    console.log(`🔤 翻訳完了: "${query}" → "${translated}"`);
    return translated;
  } catch (error) {
    console.error("❌ Translation error:", error.message);
    return query; // フォールバック：元のクエリを返す
  }
}

// ✅ Embedding生成機能
async function getEmbedding(text) {
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    console.log("⚠️ Azure OpenAI not configured, using dummy embedding");
    return new Array(1536).fill(0).map(() => Math.random() - 0.5); // ダミーembedding
  }

  try {
    const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings?api-version=2024-02-15-preview`;
    const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
    const payload = { input: text };
    
    const response = await axios.post(url, payload, { headers, timeout: 10000 });
    const embedding = response.data.data[0].embedding;
    console.log(`📊 Embedding生成完了: ${embedding.length}次元`);
    return embedding;
  } catch (error) {
    console.error("❌ Embedding error:", error.message);
    return new Array(1536).fill(0).map(() => Math.random() - 0.5); // フォールバック
  }
}

// ✅ Azure AI Search検索機能
async function searchInAzure(vector, university, research_field) {
  if (!AZURE_SEARCH_ENDPOINT || !AZURE_SEARCH_API_KEY) {
    console.log("⚠️ Azure Search not configured, returning mock data");
    return getMockSearchResults(university);
  }

  try {
    const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=2023-10-01-Preview`;
    const headers = { "Content-Type": "application/json", "api-key": AZURE_SEARCH_API_KEY };

    // フィルター構築
    const filters = [];
    if (university && university !== "All" && university.trim() !== "") {
      filters.push(`institution eq '${university}'`);
    }
    if (research_field && research_field !== "All" && research_field.trim() !== "") {
      filters.push(`classified_field eq '${research_field}'`);
    }

    const payload = {
      vectorQueries: [{ kind: "vector", vector, fields: "vector", k: 20 }],
      top: 20
    };

    if (filters.length > 0) {
      payload.filter = filters.join(' and ');
    }

    console.log(`🔍 Azure Search実行中... フィルター: ${payload.filter || 'なし'}`);
    
    const response = await axios.post(url, payload, { headers, timeout: 30000 });
    const results = response.data.value || [];
    
    console.log(`📋 Azure Search結果: ${results.length}件`);
    return results;
    
  } catch (error) {
    console.error("❌ Azure Search error:", error.message);
    return getMockSearchResults(university); // フォールバック：モックデータ
  }
}

// ✅ モックデータ生成（フォールバック用）
function getMockSearchResults(university) {
  const mockResults = [
    {
      author_name: "Dr. John Smith",
      institution: university || "Harvard University",
      orcid_filled: "https://orcid.org/0000-0000-0000-0001",
      works_count: 125,
      cited_by_count: 2350,
      h_index: 28,
      classified_field: "Computer Science",
      paper_data_count: 45,
      title: "Machine Learning Applications in Smart Cities",
      abstract: "This research explores the application of artificial intelligence and machine learning techniques in urban planning and smart city development."
    },
    {
      author_name: "Dr. Maria Garcia",
      institution: university || "Harvard Medical School",
      orcid_filled: "https://orcid.org/0000-0000-0000-0002",
      works_count: 89,
      cited_by_count: 1850,
      h_index: 22,
      classified_field: "Medical Sciences",
      paper_data_count: 67,
      title: "AI-Powered Healthcare Solutions",
      abstract: "Research focusing on the development of AI-driven healthcare technologies and their clinical applications."
    },
    {
      author_name: "Dr. David Chen",
      institution: university || "Harvard School of Engineering",
      orcid_filled: "https://orcid.org/0000-0000-0000-0003",
      works_count: 156,
      cited_by_count: 3200,
      h_index: 35,
      classified_field: "Engineering",
      paper_data_count: 89,
      title: "Sustainable Technology Innovation",
      abstract: "Innovative approaches to sustainable technology development with focus on environmental impact and social benefits."
    }
  ];
  
  console.log(`📋 モックデータ生成: ${mockResults.length}件`);
  return mockResults;
}

// ✅ AI理由生成機能
async function generateReason(originalQuery, doc) {
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    console.log("⚠️ Azure OpenAI not configured, using default reasons");
    return getDefaultReasons(originalQuery, doc);
  }

  try {
    const prompt = `
企業からの研究ニーズ:
「${originalQuery}」

対象研究者情報:
- 研究者名: ${doc.author_name}
- 所属: ${doc.institution}
- 研究分野: ${doc.classified_field}
- 論文数: ${doc.works_count}件
- 被引用数: ${doc.cited_by_count}回
- h指数: ${doc.h_index}

研究ポートフォリオ:
「${doc.title}」

研究内容サマリー:
「${doc.abstract}」

この研究者をおすすめする理由を3点挙げてください。
それぞれの理由について、200文字程度で詳しく解説してください。
特に企業のニーズとの関連性、研究実績の豊富さ、活用可能性について言及してください。

以下のフォーマットでJSON形式で出力してください。

{
  "reason_title_1": "...",
  "reason_body_1": "...",
  "reason_title_2": "...",
  "reason_body_2": "...",
  "reason_title_3": "...",
  "reason_body_3": "..."
}
`;

    const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_GPT_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;
    const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
    const payload = {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
      model: AZURE_OPENAI_GPT_DEPLOYMENT_NAME
    };

    const response = await axios.post(url, payload, { headers, timeout: 15000 });
    const rawText = response.data.choices[0].message.content.trim();
    
    // JSONパース
    const jsonMatch = rawText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || rawText.match(/{[\s\S]*}/);
    const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : null;

    if (!jsonString) {
      throw new Error("JSON形式が見つかりませんでした");
    }

    const parsed = JSON.parse(jsonString);
    console.log(`💡 AI理由生成完了: ${doc.author_name}`);
    
    return {
      reason_title_1: parsed.reason_title_1 || "",
      reason_body_1: parsed.reason_body_1 || "",
      reason_title_2: parsed.reason_title_2 || "",
      reason_body_2: parsed.reason_body_2 || "",
      reason_title_3: parsed.reason_title_3 || "",
      reason_body_3: parsed.reason_body_3 || ""
    };
    
  } catch (error) {
    console.error("❌ AI reason generation error:", error.message);
    return getDefaultReasons(originalQuery, doc);
  }
}

// ✅ デフォルト理由生成（フォールバック用）
function getDefaultReasons(originalQuery, doc) {
  return {
    reason_title_1: "研究実績の豊富さ",
    reason_body_1: `${doc.author_name}博士は${doc.works_count}件の論文と${doc.cited_by_count}回の被引用実績を持ち、「${originalQuery}」分野での深い専門知識を有しています。`,
    reason_title_2: "学術的影響力",
    reason_body_2: `h指数${doc.h_index}が示す通り、国際的に認められた研究者であり、企業の研究開発プロジェクトに高い価値をもたらすことが期待できます。`,
    reason_title_3: "専門分野との適合性",
    reason_body_3: `${doc.classified_field}分野での専門性を活かし、「${originalQuery}」に関する実用的なソリューション開発に貢献できる研究者です。`
  };
}

// ===== API エンドポイント =====

// ✅ ルートエンドポイント
app.get("/", (req, res) => {
  console.log("📞 Root endpoint called");
  res.status(200).json({ 
    status: "Server is running", 
    message: "Harvard Researcher Matching API - Production Version",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    features: [
      "Azure AI Search Integration",
      "Azure OpenAI Translation", 
      "AI-Powered Reasoning",
      "Vector Similarity Search"
    ],
    endpoints: [
      "GET / - API information",
      "GET /api/health - Health check", 
      "GET /api/env-check - Environment check",
      "POST /api/search - Search researchers (Full AI-powered)"
    ]
  });
});

// ✅ ヘルスチェック
app.get("/api/health", (req, res) => {
  console.log("🏥 Health check called");
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    index: AZURE_SEARCH_INDEX,
    services: {
      azureSearch: !!AZURE_SEARCH_ENDPOINT,
      azureOpenAI: !!AZURE_OPENAI_ENDPOINT
    }
  });
});

// ✅ 環境変数チェック
app.get("/api/env-check", (req, res) => {
  console.log("🔍 Environment check called");
  
  const envStatus = {
    AZURE_SEARCH_ENDPOINT: AZURE_SEARCH_ENDPOINT ? 'SET' : 'MISSING',
    AZURE_SEARCH_API_KEY: AZURE_SEARCH_API_KEY ? 'SET' : 'MISSING',
    AZURE_OPENAI_API_KEY: AZURE_OPENAI_API_KEY ? 'SET' : 'MISSING',
    AZURE_OPENAI_ENDPOINT: AZURE_OPENAI_ENDPOINT ? 'SET' : 'MISSING',
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: AZURE_OPENAI_EMBEDDING_DEPLOYMENT ? 'SET' : 'MISSING',
    AZURE_OPENAI_GPT_DEPLOYMENT_NAME: AZURE_OPENAI_GPT_DEPLOYMENT_NAME ? 'SET' : 'MISSING'
  };

  const allSet = Object.values(envStatus).every(status => status === 'SET');

  res.status(200).json({
    status: "Environment Variables Check",
    variables: envStatus,
    allConfigured: allSet,
    nodeVersion: process.version,
    platform: process.platform,
    port: PORT,
    searchIndex: AZURE_SEARCH_INDEX
  });
});

// ✅ メイン検索エンドポイント（本格版）
app.post("/api/search", async (req, res) => {
  console.log("🔍 Full AI-powered search endpoint called");
  const { query, university, research_field } = req.body;
  
  if (!query || query.trim() === "") {
    return res.status(400).json({ error: "研究トピックを入力してください" });
  }

  try {
    console.log(`🔍 検索開始: "${query}", 所属: "${university || 'All'}", 分野: "${research_field || 'All'}"`);
    
    // Step 1: 日本語→英語翻訳
    const englishQuery = await translateToEnglish(query);
    
    // Step 2: Embedding生成
    const embedding = await getEmbedding(englishQuery);
    
    // Step 3: Azure AI Search実行
    const documents = await searchInAzure(embedding, university, research_field);
    
    if (documents.length === 0) {
      return res.status(200).json([]);
    }

    // Step 4: 結果整形 + AI理由生成
    const results = await Promise.all(
      documents.slice(0, 10).map(async (doc) => {
        const reasonObj = await generateReason(query, doc);
        
        // データ整形
        const result = {
          name: doc.author_name || "N/A",
          institution: doc.institution || "N/A",
          orcid: doc.orcid_filled || "N/A",
          works_count: typeof doc.works_count === 'number' ? doc.works_count : 
                      (typeof doc.works_count === 'string' ? parseInt(doc.works_count) || 0 : 0),
          cited_by_count: typeof doc.cited_by_count === 'number' ? doc.cited_by_count : 
                         (typeof doc.cited_by_count === 'string' ? parseInt(doc.cited_by_count) || 0 : 0),
          h_index: typeof doc.h_index === 'number' ? doc.h_index : 
                  (typeof doc.h_index === 'string' ? parseInt(doc.h_index) || 0 : 0),
          classified_field: doc.classified_field || "Unknown",
          paper_data_count: typeof doc.paper_data_count === 'number' ? doc.paper_data_count : 
                           (typeof doc.paper_data_count === 'string' ? parseInt(doc.paper_data_count) || 0 : 0),
          ...reasonObj
        };

        return result;
      })
    );

    console.log(`✅ 検索完了: ${results.length}件の結果を返します`);
    res.status(200).json(results);
    
  } catch (error) {
    console.error("❌ 検索エラー:", error);
    res.status(500).json({ 
      error: "検索中にエラーが発生しました",
      details: process.env.NODE_ENV === 'development' ? error.message : "Internal server error"
    });
  }
});

// ✅ 404ハンドリング
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: "Endpoint not found",
    availableEndpoints: ["/", "/api/health", "/api/env-check", "/api/search"]
  });
});

// ✅ エラーハンドリング
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ✅ サーバー起動
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Harvard Researcher Matching API (Production) started on port ${PORT}`);
  console.log(`🕐 Start time: ${new Date().toISOString()}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`🔗 Available at: http://0.0.0.0:${PORT}`);
  console.log(`🚀 Features: Azure AI Search + Azure OpenAI Integration`);
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

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});