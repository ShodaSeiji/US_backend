// ✅ 修正版 index.js（institutionフィルター処理をアプリ内に移動）
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
const AZURE_SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX_NAME || "harvard-index-v5";
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
const AZURE_OPENAI_GPT_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_GPT_DEPLOYMENT_NAME;

if (
  !AZURE_SEARCH_ENDPOINT || !AZURE_SEARCH_API_KEY || !AZURE_SEARCH_INDEX ||
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

async function searchInAzure(vector) {
  const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=2023-10-01-Preview`;
  const headers = { "Content-Type": "application/json", "api-key": AZURE_SEARCH_API_KEY };

  const payload = {
    vectorQueries: [{ kind: "vector", vector, fields: "vector", k: 100 }]
    // ← institutionフィルターは除外
  };

  const response = await axios.post(url, payload, { headers });
  return response.data.value || [];
}

async function generateReason(originalQuery, doc) {
  const prompt = `
企業からの研究ニーズ:
「${originalQuery}」

対象研究者の論文タイトル:
「${doc.title}」

対象研究者のアブストラクト:
「${doc.abstract}」

この研究者をおすすめする理由を3点挙げてください。
それぞれの理由について、400ワード程度で詳しく丁寧に解説してください。
特に企業のニーズとの関連性、活用可能性、期待される効果について言及してください。

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

app.post("/api/search", async (req, res) => {
  const { query, university } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body." });
  }

  try {
    const englishQuery = await translateToEnglish(query);
    const embedding = await getEmbedding(englishQuery);
    const rawDocuments = await searchInAzure(embedding);

    // 🔍 フロントから渡された university によるフィルター
    const documents = (university && university !== "All")
      ? rawDocuments.filter(doc => doc.institution === university)
      : rawDocuments;

    const results = await Promise.all(
      documents.map(async (doc) => {
        const reasonObj = await generateReason(query, doc);
        return {
          name: doc.author_name || "N/A",
          institution: doc.institution || "N/A",
          orcid: doc.orcid_filled || "N/A",
          paper_count: doc.paper_count || 1,
          ...reasonObj
        };
      })
    );

    res.json(results);
  } catch (err) {
    console.error("❌ サーバーエラー:", err.response?.data || err.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
