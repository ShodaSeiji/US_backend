// ✅ 完全修正版 index_v4.js（フィールドマッピング問題解決版）
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

async function searchInAzure(vector, university, research_field) {
  const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=2023-10-01-Preview`;
  const headers = { "Content-Type": "application/json", "api-key": AZURE_SEARCH_API_KEY };

  // ✅ 複数フィルターの組み合わせ
  const filters = [];
  if (university && university !== "All") {
    filters.push(`institution eq '${university}'`);
  }
  if (research_field && research_field !== "All") {
    filters.push(`classified_field eq '${research_field}'`);
  }

  const payload = {
    vectorQueries: [{ kind: "vector", vector, fields: "vector", k: 100 }],
    filter: filters.length > 0 ? filters.join(' and ') : null
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

// ✅ メインAPIエンドポイント（デバッグ強化版）
app.post("/api/search", async (req, res) => {
  const { query, university, research_field } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body." });
  }

  try {
    console.log(`🔍 検索開始: "${query}", 所属フィルター: "${university || 'All'}", 分野フィルター: "${research_field || 'All'}"`);
    
    const englishQuery = await translateToEnglish(query);
    console.log(`🔤 英訳: "${englishQuery}"`);
    
    const embedding = await getEmbedding(englishQuery);
    console.log(`📊 Embedding生成完了: ${embedding.length}次元`);
    
    const documents = await searchInAzure(embedding, university, research_field);
    console.log(`📋 検索結果: ${documents.length}件`);

    // ✅ デバッグ: 最初の結果を詳細ログ出力
    if (documents.length > 0) {
      console.log("🔍 最初の検索結果詳細:");
      const firstDoc = documents[0];
      console.log("- author_name:", firstDoc.author_name);
      console.log("- works_count:", firstDoc.works_count, typeof firstDoc.works_count);
      console.log("- cited_by_count:", firstDoc.cited_by_count, typeof firstDoc.cited_by_count);
      console.log("- h_index:", firstDoc.h_index, typeof firstDoc.h_index);
      console.log("- institution:", firstDoc.institution);
      console.log("- classified_field:", firstDoc.classified_field);
    }

    const results = await Promise.all(
      documents.map(async (doc) => {
        const reasonObj = await generateReason(query, doc);
        
        // ✅ フィールドマッピングを厳密に修正
        const result = {
          name: doc.author_name || "N/A",
          institution: doc.institution || "N/A",
          orcid: doc.orcid_filled || "N/A",
          
          // ✅ 数値フィールドの安全な変換
          works_count: typeof doc.works_count === 'number' ? doc.works_count : 
                      (typeof doc.works_count === 'string' ? parseInt(doc.works_count) || 0 : 0),
          cited_by_count: typeof doc.cited_by_count === 'number' ? doc.cited_by_count : 
                         (typeof doc.cited_by_count === 'string' ? parseInt(doc.cited_by_count) || 0 : 0),
          h_index: typeof doc.h_index === 'number' ? doc.h_index : 
                  (typeof doc.h_index === 'string' ? parseInt(doc.h_index) || 0 : 0),
          
          classified_field: doc.classified_field || "Unknown",
          paper_data_count: typeof doc.paper_data_count === 'number' ? doc.paper_data_count : 
                           (typeof doc.paper_data_count === 'string' ? parseInt(doc.paper_data_count) || 0 : 0),
          
          // ✅ レガシー対応（フロントエンドがpaper_countを期待している場合）
          paper_count: typeof doc.works_count === 'number' ? doc.works_count : 
                      (typeof doc.works_count === 'string' ? parseInt(doc.works_count) || 0 : 0),
          
          ...reasonObj
        };

        // ✅ デバッグ: 変換後の値をログ出力
        console.log(`📊 ${doc.author_name} の変換後データ:`, {
          works_count: result.works_count,
          cited_by_count: result.cited_by_count,
          h_index: result.h_index,
          paper_count: result.paper_count
        });

        return result;
      })
    );

    console.log(`✅ レスポンス生成完了: ${results.length}件`);
    
    // ✅ レスポンス前に最終確認
    if (results.length > 0) {
      console.log("🎯 最終レスポンス（最初の1件）:", {
        name: results[0].name,
        works_count: results[0].works_count,
        cited_by_count: results[0].cited_by_count,
        h_index: results[0].h_index
      });
    }
    
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