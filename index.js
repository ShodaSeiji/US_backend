// ✅ index.js（v3構成：textフィールド統合・title/abstract廃止・orcid単位対応）
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
  !AZURE_SEARCH_ENDPOINT ||
  !AZURE_SEARCH_API_KEY ||
  !AZURE_SEARCH_INDEX ||
  !AZURE_OPENAI_API_KEY ||
  !AZURE_OPENAI_ENDPOINT ||
  !AZURE_OPENAI_EMBEDDING_DEPLOYMENT ||
  !AZURE_OPENAI_GPT_DEPLOYMENT_NAME
) {
  console.error("❌ 必要な環境変数が不足しています。");
  process.exit(1);
}

// 翻訳（GPT）
async function translateToEnglish(query) {
  const prompt = `あなたは日本語から英語への翻訳アシスタントです。以下の日本語の研究トピックを、自然な英語に正確に翻訳してください（専門的な学術用語を維持してください）：\n「${query}」\n英訳：`;
  const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_GPT_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;
  const headers = {
    "Content-Type": "application/json",
    "api-key": AZURE_OPENAI_API_KEY,
  };
  const payload = {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    model: AZURE_OPENAI_GPT_DEPLOYMENT_NAME,
  };
  const response = await axios.post(url, payload, { headers });
  return response.data.choices[0].message.content.trim();
}

// Embedding生成
async function getEmbedding(text) {
  const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings?api-version=2024-02-15-preview`;
  const headers = {
    "Content-Type": "application/json",
    "api-key": AZURE_OPENAI_API_KEY,
  };
  const payload = { input: text };
  const response = await axios.post(url, payload, { headers });
  return response.data.data[0].embedding;
}

// Azure Search
async function searchInAzure(vector, university) {
  const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=2023-10-01-Preview`;
  const headers = {
    "Content-Type": "application/json",
    "api-key": AZURE_SEARCH_API_KEY,
  };
  const payload = {
    vectorQueries: [
      {
        kind: "vector",
        vector: vector,
        fields: "vector",
        k: 20,
      },
    ],
    filter: university ? `university eq '${university}'` : undefined,
  };
  console.log("📨 Azure Search 送信Payload:");
  console.dir(payload, { depth: null });
  const response = await axios.post(url, payload, { headers });
  return response.data.value || [];
}


// 推薦理由生成（textベース）
async function generateReason(originalQuery, doc) {
  const prompt = `あなたは企業と研究者をマッチングするAIアシスタントです。企業からの相談内容：\n「${originalQuery}」\n\n以下の研究者の研究がマッチ候補です：\n研究内容: ${doc.text}\n\nこの研究者が企業ニーズにマッチしている理由を、1000文字で詳しく説明してください。`;
  const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_GPT_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;
  const headers = {
    "Content-Type": "application/json",
    "api-key": AZURE_OPENAI_API_KEY,
  };
  const payload = {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    model: AZURE_OPENAI_GPT_DEPLOYMENT_NAME,
  };
  const response = await axios.post(url, payload, { headers });
  return response.data.choices[0].message.content.trim();
}

// エンドポイント
app.post("/api/search", async (req, res) => {
  const { query, university } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Missing 'query' in request body." });
  }
  try {
    console.log("🔍 検索クエリ:", query);
    const englishQuery = await translateToEnglish(query);
    const embedding = await getEmbedding(englishQuery);
    const documents = await searchInAzure(embedding, university);
    const results = await Promise.all(
      documents.map(async (doc, idx) => {
        const reason = await generateReason(query, doc);
        return {
          name: doc.author_name || "N/A",
          institution: doc.institution || "N/A",
          orcid: doc.orcid_filled || "N/A",
          paper_count: doc.paper_count || 1,
          reason: reason,
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
