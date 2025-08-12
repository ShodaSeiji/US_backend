// ✅ 修正版 index.js（v4データ構造対応版）
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AZURE_SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const AZURE_SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY;
const AZURE_SEARCH_INDEX = "harvard-index-v6"; // ✅ v6インデックスに更新
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
const AZURE_OPENAI_GPT_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_GPT_DEPLOYMENT_NAME;

if (
  !AZURE_SEARCH_ENDPOINT || !AZURE_SEARCH_API_KEY || 
  !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT ||
  !AZURE_OPENAI_EMBEDDING_DEPLOYMENT || !AZURE_OPENAI_GPT_DEPLOYMENT_NAME
) {
  console.error("❌ 必要な環境変数が不足しています。");
  process.exit(1);
}

async function translateToEnglish(query) {
  const prompt = `以下の日本語の研究トピックを、専門用語を保ちつつ自然な英語に翻訳してください：\n「${query}」\n英訳：`;
  const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_GPT_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;
  const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
  const payload = {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    model: AZURE_OPENAI_GPT_DEPLOYMENT_NAME
  };
  const response = await axios.post(url, payload, { headers });
  return response.data.choices[0].message.content.trim();
}

async function getEmbedding(text) {
  const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings?api-version=2024-02-15-preview`;
  const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
  const payload = { input: text };
  const response = await axios.post(url, payload, { headers });
  return response.data.data[0].embedding;
}

async function searchInAzure(vector, university) {
  const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=2023-10-01-Preview`;
  const headers = { "Content-Type": "application/json", "api-key": AZURE_SEARCH_API_KEY };

  const payload = {
    vectorQueries: [{ kind: "vector", vector, fields: "vector", k: 100 }],
    // ✅ university フィルターをクエリに追加（空でない場合）
    filter: university && university !== "All" ? `institution eq '${university}'` : null
  };

  // filterがnullの場合は削除
  if (!payload.filter) {
    delete payload.filter;
  }

  const response = await axios.post(url, payload, { headers });
  return response.data.value || [];
}

// ✅ generateReason関数を新しいデータ構造に対応
async function generateReason(originalQuery, doc) {
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
それぞれの理由について、400ワード程度で詳しく丁寧に解説してください。
特に企業のニーズとの関連性、研究実績の豊富さ、活用可能性、期待される効果について言及してください。

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
    model: AZURE_OPENAI_GPT_DEPLOYMENT_NAME
  };

  try {
    const response = await axios.post(url, payload, { headers });
    const rawText = response.data.choices[0].message.content.trim();
    const jsonMatch = rawText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || rawText.match(/{[\s\S]*}/);
    const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : null;

    if (!jsonString) {
      throw new Error("⚠️ JSON形式が見つかりませんでした");
    }

    const parsed = JSON.parse(jsonString);
    return {
      reason_title_1: parsed.reason_title_1 || "",
      reason_body_1: parsed.reason_body_1 || "",
      reason_title_2: parsed.reason_title_2 || "",
      reason_body_2: parsed.reason_body_2 || "",
      reason_title_3: parsed.reason_title_3 || "",
      reason_body_3: parsed.reason_body_3 || "",
    };
  } catch (err) {
    console.error("❌ generateReason error:", err.message);
    return {
      reason_title_1: "",
      reason_body_1: "",
      reason_title_2: "",
      reason_body_2: "",
      reason_title_3: "",
      reason_body_3: "",
    };
  }
}

// ✅ メインAPIエンドポイント（v4データ構造対応）
app.post("/api/search", async (req, res) => {
  const { query, university } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body." });
  }

  try {
    console.log(`🔍 検索開始: "${query}", 所属フィルター: "${university || 'All'}"`);
    
    const englishQuery = await translateToEnglish(query);
    console.log(`🔤 英訳: "${englishQuery}"`);
    
    const embedding = await getEmbedding(englishQuery);
    console.log(`📊 Embedding生成完了: ${embedding.length}次元`);
    
    const documents = await searchInAzure(embedding, university);
    console.log(`📋 検索結果: ${documents.length}件`);

    const results = await Promise.all(
      documents.map(async (doc) => {
        const reasonObj = await generateReason(query, doc);
        
        // ✅ v4データ構造に対応したレスポンス
        return {
          name: doc.author_name || "N/A",
          institution: doc.institution || "N/A",
          orcid: doc.orcid_filled || "N/A",
          
          // ✅ 新しい研究指標フィールド
          works_count: doc.works_count || 0,
          cited_by_count: doc.cited_by_count || 0,
          h_index: doc.h_index || 0,
          classified_field: doc.classified_field || "Unknown",
          paper_data_count: doc.paper_data_count || 0,
          
          // ✅ レガシー対応（フロントエンドがpaper_countを期待している場合）
          paper_count: doc.works_count || 0,
          
          ...reasonObj
        };
      })
    );

    console.log(`✅ レスポンス生成完了: ${results.length}件`);
    res.json(results);
    
  } catch (err) {
    console.error("❌ サーバーエラー:", err.response?.data || err.message);
    res.status(500).json({ 
      error: "Internal server error.",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ ヘルスチェックエンドポイント
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    index: AZURE_SEARCH_INDEX,
    timestamp: new Date().toISOString()
  });
});

// ✅ インデックス情報エンドポイント（デバッグ用）
app.get("/api/index-info", async (req, res) => {
  try {
    const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}?api-version=2023-10-01-Preview`;
    const headers = { "api-key": AZURE_SEARCH_API_KEY };
    
    const response = await axios.get(url, { headers });
    const indexInfo = response.data;
    
    res.json({
      name: indexInfo.name,
      fields: indexInfo.fields?.length || 0,
      fieldNames: indexInfo.fields?.map(f => f.name) || [],
      vectorFields: indexInfo.fields?.filter(f => f.type === "Collection(Edm.Single)").length || 0
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get index info" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 Using index: ${AZURE_SEARCH_INDEX}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔍 Index info: http://localhost:${PORT}/api/index-info`);
});