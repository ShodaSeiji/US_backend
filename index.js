// 🎯 研究者データ集約完全ソリューション
console.log("🚀 Harvard Researcher Matching API - Aggregated Data Solution");

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

console.log("🔍 Environment check:");
console.log("- Azure Search:", !!AZURE_SEARCH_ENDPOINT);
console.log("- Azure OpenAI:", !!AZURE_OPENAI_ENDPOINT);
console.log("🎯 Feature: Research data aggregation by author");

// ✅ 翻訳機能
async function translateToEnglish(query) {
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(query);
  
  if (!hasJapanese) {
    console.log(`🔤 英語クエリ: "${query}"`);
    return query;
  }

  if (AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT) {
    try {
      const prompt = `以下の日本語を英語に翻訳してください：\n「${query}」\n英訳：`;
      const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_GPT_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;
      const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
      const payload = {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 100
      };
      
      const response = await axios.post(url, payload, { headers, timeout: 8000 });
      const translated = response.data.choices[0].message.content.trim();
      console.log(`🔤 翻訳成功: "${query}" → "${translated}"`);
      return translated;
    } catch (error) {
      console.error("❌ Translation error:", error.message);
    }
  }

  console.log(`🔤 翻訳スキップ: "${query}"`);
  return query;
}

// ✅ Embedding生成
async function getEmbedding(text) {
  if (AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT) {
    try {
      const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}/embeddings?api-version=2024-02-15-preview`;
      const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
      const payload = { input: text };
      
      const response = await axios.post(url, payload, { headers, timeout: 10000 });
      const embedding = response.data.data[0].embedding;
      console.log(`📊 Embedding生成: ${embedding.length}次元`);
      return embedding;
    } catch (error) {
      console.error("❌ Embedding error:", error.message);
    }
  }

  // フォールバック
  console.log("🔄 フォールバック embedding");
  return new Array(3072).fill(0).map(() => Math.random() - 0.5);
}

// 🎯 研究者データ集約関数
function aggregateResearcherData(rawResults) {
  console.log(`🔄 研究者データ集約開始: ${rawResults.length}件の生データ`);
  
  // author_name でグループ化
  const groupedByAuthor = {};
  
  rawResults.forEach((doc, index) => {
    const authorKey = doc.author_name || `Unknown_${index}`;
    
    if (!groupedByAuthor[authorKey]) {
      groupedByAuthor[authorKey] = {
        papers: [],
        author_name: doc.author_name,
        institution: doc.institution,
        orcid_filled: doc.orcid_filled,
        classified_field: doc.classified_field,
        // 集約用データ
        cited_by_counts: [],
        h_indices: [],
        titles: [],
        abstracts: []
      };
    }
    
    // データを蓄積
    groupedByAuthor[authorKey].papers.push(doc);
    
    // 数値データを配列に追加
    if (doc.cited_by_count) groupedByAuthor[authorKey].cited_by_counts.push(parseInt(doc.cited_by_count) || 0);
    if (doc.h_index) groupedByAuthor[authorKey].h_indices.push(parseInt(doc.h_index) || 0);
    if (doc.title) groupedByAuthor[authorKey].titles.push(doc.title);
    if (doc.abstract) groupedByAuthor[authorKey].abstracts.push(doc.abstract);
  });

  console.log(`📊 グループ化完了: ${Object.keys(groupedByAuthor).length}名の研究者`);

  // 研究者ごとに集約されたデータを生成
  const aggregatedData = Object.values(groupedByAuthor).map(group => {
    const paperCount = group.papers.length; // 実際の論文数 = CSV行数
    const totalCitations = group.cited_by_counts.reduce((sum, count) => sum + count, 0);
    const maxHIndex = Math.max(...group.h_indices, 0);
    
    console.log(`👨‍🔬 ${group.author_name}:`);
    console.log(`   - 論文数（CSV行数）: ${paperCount}`);
    console.log(`   - 総被引用数: ${totalCitations}`);
    console.log(`   - 最大h指数: ${maxHIndex}`);

    return {
      author_name: group.author_name,
      institution: group.institution,
      orcid_filled: group.orcid_filled,
      // 🎯 正しい集約値
      paper_count: paperCount, // 実際の論文数（CSV行数）
      works_titles_count: group.titles.length,
      works_concepts_count: paperCount,
      cited_by_count: totalCitations, // 被引用数の合計
      h_index: maxHIndex, // h指数の最大値
      classified_field: group.classified_field,
      title: group.titles[0] || "No title",
      abstract: group.abstracts[0] || "No abstract"
    };
  });

  // 論文数の多い順にソート
  aggregatedData.sort((a, b) => b.paper_count - a.paper_count);

  console.log(`✅ 集約完了: 論文数上位5名`);
  aggregatedData.slice(0, 5).forEach((researcher, index) => {
    console.log(`   ${index + 1}. ${researcher.author_name}: ${researcher.paper_count}件`);
  });

  return aggregatedData;
}

// 🎯 Azure AI Search（集約対応版）
async function searchInAzureWithAggregation(vector, university, research_field) {
  if (!AZURE_SEARCH_ENDPOINT || !AZURE_SEARCH_API_KEY) {
    console.log("⚠️ Azure Search未設定、集約モックデータを返します");
    return getAggregatedMockData(university);
  }

  try {
    const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=2023-10-01-Preview`;
    const headers = { "Content-Type": "application/json", "api-key": AZURE_SEARCH_API_KEY };

    const filters = [];
    if (university && university !== "All" && university.trim() !== "") {
      filters.push(`institution eq '${university}'`);
    }
    if (research_field && research_field !== "All" && research_field.trim() !== "") {
      filters.push(`classified_field eq '${research_field}'`);
    }

    const payload = {
      vectorQueries: [{ kind: "vector", vector, fields: "vector", k: 300 }], // より多くの結果
      top: 300, // 集約前に十分なデータを取得
      select: "author_name,institution,orcid_filled,paper_count,works_titles_count,works_concepts_count,cited_by_count,h_index,classified_field,title,abstract"
    };

    if (filters.length > 0) {
      payload.filter = filters.join(' and ');
    }

    console.log(`🔍 Azure Search実行（集約用）...`);
    console.log(`   - 取得件数: ${payload.top}件（集約前）`);
    console.log(`   - Filter: ${payload.filter || 'なし'}`);
    
    const response = await axios.post(url, payload, { headers, timeout: 30000 });
    const rawResults = response.data.value || [];
    
    console.log(`📋 Azure Search生データ: ${rawResults.length}件`);

    // 🎯 重要: 研究者ごとにデータを集約
    const aggregatedResults = aggregateResearcherData(rawResults);
    
    console.log(`✅ 集約後データ: ${aggregatedResults.length}件の研究者`);
    
    // 上位20名を返す
    return aggregatedResults.slice(0, 20);
    
  } catch (error) {
    console.error("❌ Azure Search error:", error.message);
    return getAggregatedMockData(university);
  }
}

// 🎯 集約モックデータ
function getAggregatedMockData(university) {
  const mockData = [
    {
      author_name: "Dr. John Smith",
      institution: university || "Harvard University",
      orcid_filled: "https://orcid.org/0000-0000-0000-0001",
      paper_count: 45, // 複数論文の合計
      works_titles_count: 45,
      works_concepts_count: 45,
      cited_by_count: 1250, // 複数論文の被引用数合計
      h_index: 28,
      classified_field: "Computer Science",
      title: "Machine Learning Applications in Smart Cities",
      abstract: "This research explores various applications of AI..."
    },
    {
      author_name: "Dr. Maria Garcia",
      institution: university || "Harvard Medical School",
      orcid_filled: "https://orcid.org/0000-0000-0000-0002",
      paper_count: 32, // 複数論文の合計
      works_titles_count: 32,
      works_concepts_count: 32,
      cited_by_count: 890, // 複数論文の被引用数合計
      h_index: 22,
      classified_field: "Medical Sciences",
      title: "AI-Powered Healthcare Solutions",
      abstract: "Research focusing on healthcare AI applications..."
    },
    {
      author_name: "Dr. David Chen",
      institution: university || "Harvard School of Engineering",
      orcid_filled: "https://orcid.org/0000-0000-0000-0003",
      paper_count: 67, // 複数論文の合計
      works_titles_count: 67,
      works_concepts_count: 67,
      cited_by_count: 2100, // 複数論文の被引用数合計
      h_index: 35,
      classified_field: "Engineering",
      title: "Sustainable Technology Innovation",
      abstract: "Innovative approaches to sustainable development..."
    }
  ];
  
  console.log(`📋 集約モックデータ生成完了`);
  return mockData;
}

// 🎯 データ整形関数
function formatAggregatedResearcherData(doc) {
  const result = {
    name: doc.author_name || "Unknown Researcher",
    institution: doc.institution || "Unknown Institution",
    orcid: doc.orcid_filled || "N/A",
    works_count: doc.paper_count, // 集約された論文数
    paper_count: doc.paper_count, // 集約された論文数
    cited_by_count: doc.cited_by_count || 0,
    h_index: doc.h_index || 0,
    classified_field: doc.classified_field || "Unknown",
    works_titles_count: doc.works_titles_count || doc.paper_count,
    works_concepts_count: doc.works_concepts_count || doc.paper_count,
    paper_data_count: doc.paper_count
  };

  console.log(`✅ 整形完了: ${result.name} - 論文数: ${result.paper_count}`);
  return result;
}

// ✅ AI理由生成
async function generateReason(query, doc) {
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    return getDefaultReasons(query, doc);
  }

  try {
    const prompt = `
企業からの研究ニーズ:
「${query}」

対象研究者情報:
- 研究者名: ${doc.name}
- 所属: ${doc.institution}
- 研究分野: ${doc.classified_field}
- 論文数: ${doc.paper_count}件
- 被引用数: ${doc.cited_by_count}回
- h指数: ${doc.h_index}

この研究者をおすすめする理由を3点挙げてください。
それぞれの理由について、1200ワード程度で詳しく丁寧に解説してください。
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
      max_tokens: 1000
    };

    const response = await axios.post(url, payload, { headers, timeout: 15000 });
    const rawText = response.data.choices[0].message.content.trim();
    
    const jsonMatch = rawText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || rawText.match(/{[\s\S]*}/);
    const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : null;

    if (!jsonString) {
      throw new Error("JSON形式が見つかりませんでした");
    }

    const parsed = JSON.parse(jsonString);
    console.log(`💡 AI理由生成完了: ${doc.name}`);
    
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
    return getDefaultReasons(query, doc);
  }
}

// ✅ デフォルト理由生成
function getDefaultReasons(query, doc) {
  return {
    reason_title_1: "豊富な研究実績",
    reason_body_1: `${doc.name}博士は${doc.paper_count}件の論文と${doc.cited_by_count}回の被引用実績を持ち、「${query}」分野での深い専門知識を有しています。企業の研究ニーズに応える十分な経験と知識を備えた研究者です。`,
    reason_title_2: "高い学術的影響力",
    reason_body_2: `h指数${doc.h_index}が示すように、国際的に認められた研究者であり、研究成果の質と影響力が証明されています。企業との共同研究において、高い価値を提供することが期待できます。`,
    reason_title_3: "専門分野との適合性",
    reason_body_3: `${doc.classified_field}分野での専門性を活かし、「${query}」に関する実用的なソリューション開発に貢献できる理想的な研究パートナーです。理論と実践の両面でサポートが可能です。`
  };
}

// ===== API エンドポイント =====

app.get("/", (req, res) => {
  res.status(200).json({ 
    status: "Server is running", 
    message: "Harvard Researcher Matching API - Aggregated Data Solution",
    timestamp: new Date().toISOString(),
    version: "3.0.0",
    feature: "Research data aggregation by author (CSV row-level → Author-level)",
    description: "Aggregates multiple CSV rows per researcher into single author records"
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "3.0.0",
    index: AZURE_SEARCH_INDEX,
    feature: "Data aggregation enabled"
  });
});

app.get("/api/env-check", (req, res) => {
  const envStatus = {
    AZURE_SEARCH_ENDPOINT: AZURE_SEARCH_ENDPOINT ? 'SET' : 'MISSING',
    AZURE_SEARCH_API_KEY: AZURE_SEARCH_API_KEY ? 'SET' : 'MISSING',
    AZURE_OPENAI_API_KEY: AZURE_OPENAI_API_KEY ? 'SET' : 'MISSING',
    AZURE_OPENAI_ENDPOINT: AZURE_OPENAI_ENDPOINT ? 'SET' : 'MISSING',
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: AZURE_OPENAI_EMBEDDING_DEPLOYMENT ? 'SET' : 'MISSING',
    AZURE_OPENAI_GPT_DEPLOYMENT_NAME: AZURE_OPENAI_GPT_DEPLOYMENT_NAME ? 'SET' : 'MISSING'
  };

  res.status(200).json({
    status: "Environment Variables Check",
    variables: envStatus,
    allConfigured: Object.values(envStatus).every(status => status === 'SET'),
    nodeVersion: process.version,
    searchIndex: AZURE_SEARCH_INDEX,
    dataModel: {
      input: "CSV rows per paper",
      processing: "Aggregate by author_name",
      output: "Author-level statistics"
    }
  });
});

// ✅ メイン検索エンドポイント（集約対応版）
app.post("/api/search", async (req, res) => {
  console.log("🔍 Aggregated search endpoint called");
  const { query, university, research_field } = req.body;
  
  if (!query || query.trim() === "") {
    return res.status(400).json({ error: "研究トピックを入力してください" });
  }

  try {
    console.log(`🔍 集約検索開始: "${query}"`);
    console.log(`   - 所属フィルター: "${university || 'All'}"`);
    console.log(`   - 分野フィルター: "${research_field || 'All'}"`);
    
    // Step 1: 翻訳
    const englishQuery = await translateToEnglish(query);
    
    // Step 2: Embedding
    const embedding = await getEmbedding(englishQuery);
    
    // Step 3: 集約検索実行
    const aggregatedDocuments = await searchInAzureWithAggregation(embedding, university, research_field);
    
    if (aggregatedDocuments.length === 0) {
      console.log("⚠️ 集約後の検索結果なし");
      return res.status(200).json([]);
    }

    // Step 4: データ整形 + AI理由生成
    const results = await Promise.all(
      aggregatedDocuments.slice(0, 10).map(async (doc) => {
        const formatted = formatAggregatedResearcherData(doc);
        const reasons = await generateReason(query, formatted);
        return { ...formatted, ...reasons };
      })
    );

    console.log(`✅ 集約検索完了: ${results.length}件の研究者`);
    
    // 結果確認
    results.forEach((result, index) => {
      console.log(`📊 研究者${index + 1}: ${result.name}`);
      console.log(`   - 集約論文数: ${result.paper_count}`);
      console.log(`   - 集約被引用数: ${result.cited_by_count}`);
      console.log(`   - h指数: ${result.h_index}`);
      console.log(`   - 分野: ${result.classified_field}`);
    });
    
    res.status(200).json(results);
    
  } catch (error) {
    console.error("❌ 集約検索エラー:", error);
    res.status(500).json({ 
      error: "検索中にエラーが発生しました",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`🎯 Feature: Research data aggregation by author`);
  console.log(`📊 Data flow: CSV rows → Author grouping → Aggregated metrics`);
  console.log(`📋 Index: ${AZURE_SEARCH_INDEX}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));