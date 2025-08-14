// 🎯 研究者データ集約完全ソリューション（多言語対応版）
console.log("🚀 Harvard Researcher Matching API - Multilingual Enhanced v3.2.0");

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

console.log("🔧 Environment check:");
console.log("- Azure Search:", !!AZURE_SEARCH_ENDPOINT);
console.log("- Azure OpenAI:", !!AZURE_OPENAI_ENDPOINT);
console.log("🎯 Feature: Research data aggregation by author + Multilingual AI reasoning");

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
  console.log("📄 フォールバック embedding");
  return new Array(3072).fill(0).map(() => Math.random() - 0.5);
}

// 🎯 研究者データ集約関数
function aggregateResearcherData(rawResults) {
  console.log(`📄 研究者データ集約開始: ${rawResults.length}件の生データ`);
  
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

// ✅ AI理由生成（多言語対応版 - 詳細な理由生成）
async function generateReason(query, doc, language = 'ja') {
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    return getEnhancedDefaultReasons(query, doc, language);
  }

  try {
    const prompt = language === 'en' ? 
      getEnglishPrompt(query, doc) : 
      getJapanesePrompt(query, doc);

    const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_GPT_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;
    const headers = { "Content-Type": "application/json", "api-key": AZURE_OPENAI_API_KEY };
    const payload = {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 3000,
      top_p: 0.9,
      frequency_penalty: 0.0,
      presence_penalty: 0.0
    };

    const response = await axios.post(url, payload, { headers, timeout: 30000 });
    const rawText = response.data.choices[0].message.content.trim();
    
    const jsonMatch = rawText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || rawText.match(/{[\s\S]*}/);
    const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : null;

    if (!jsonString) {
      throw new Error("JSON形式が見つかりませんでした");
    }

    const parsed = JSON.parse(jsonString);
    console.log(`💡 AI理由生成完了: ${doc.name} (${language === 'en' ? 'English' : '日本語'}版)`);
    
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
    return getEnhancedDefaultReasons(query, doc, language);
  }
}

// ✅ 英語プロンプト
function getEnglishPrompt(query, doc) {
  return `
Corporate Research Needs:
"${query}"

Target Researcher Information:
- Researcher Name: ${doc.name}
- Institution: ${doc.institution}
- Research Field: ${doc.classified_field}
- Number of Papers: ${doc.paper_count} papers
- Citations: ${doc.cited_by_count} times
- h-index: ${doc.h_index}

Please provide 3 detailed reasons why this researcher is recommended for the corporate research needs from the following perspectives:

1. Relevance between corporate needs and researcher's expertise (Title: ~20 words + Body: ~500 words)
2. Research achievements and specialized strengths (Title: ~20 words + Body: ~500 words)
3. Expected effects and outcomes (Title: ~20 words + Body: ~500 words)

For each reason, please include detailed descriptions covering:
- Specific relevance to corporate needs
- Rich research experience and qualitative evaluation
- Potential for practical application and commercialization
- Expected specific effects and outcomes
- Value proposition for collaborative research

Please output in the following JSON format (each body should be 400-600 words with detailed descriptions):

{
  "reason_title_1": "Specific title showing high relevance to corporate needs",
  "reason_body_1": "Detailed explanation about the relevance between corporate needs and researcher's expertise, including specific research content, applicability, and approaches to solving corporate challenges (500 words)",
  "reason_title_2": "Title representing research achievements and specialized strengths",
  "reason_body_2": "Detailed analysis of quantitative achievements such as paper count, citations, h-index, qualitative evaluation, research field position, international recognition, past achievements (500 words)",
  "reason_title_3": "Title of expected specific effects and outcomes",
  "reason_body_3": "Detailed explanation of specific outcomes expected from collaborative research, technology transfer potential, commercialization pathways, competitive advantages for corporations, market impact (500 words)"
}
`;
}

// ✅ 日本語プロンプト
function getJapanesePrompt(query, doc) {
  return `
企業からの研究ニーズ:
「${query}」

対象研究者情報:
- 研究者名: ${doc.name}
- 所属: ${doc.institution}
- 研究分野: ${doc.classified_field}
- 論文数: ${doc.paper_count}件
- 被引用数: ${doc.cited_by_count}回
- h指数: ${doc.h_index}

この研究者をおすすめする理由を以下の3つの観点から詳しく説明してください：

1. 企業ニーズと研究者の関連性（見出し20ワード程度 + 本文500ワード程度）
2. 研究者の実績や強みなど特徴の説明（見出し20ワード程度 + 本文500ワード程度）  
3. 期待される効果・成果（見出し20ワード程度 + 本文500ワード程度）

各理由について、以下の要素を含めて詳細に記述してください：
- 企業のニーズとの具体的な関連性
- 研究実績の豊富さと質的評価
- 実用化・商業化への活用可能性
- 期待される具体的な効果と成果
- 共同研究における価値提案

以下のJSON形式で出力してください（各本文は400-600ワードで詳細に記述）：

{
  "reason_title_1": "企業ニーズとの高い関連性を示す具体的なタイトル",
  "reason_body_1": "企業ニーズと研究者の専門分野の関連性について、具体的な研究内容、応用可能性、企業が抱える課題への解決アプローチを詳細に説明する長文（500ワード程度）",
  "reason_title_2": "研究実績と専門性の強みを表すタイトル", 
  "reason_body_2": "研究者の論文数、被引用数、h指数等の定量的実績と、その質的評価、研究分野での地位、国際的な認知度、過去の成果等を詳細に分析した説明（500ワード程度）",
  "reason_title_3": "期待される具体的な効果と成果のタイトル",
  "reason_body_3": "共同研究により期待される具体的な成果、技術移転の可能性、商業化への道筋、企業にもたらされる競争優位性、市場への影響等を詳細に説明（500ワード程度）"
}
`;
}

// ✅ 強化版デフォルト理由生成（多言語対応）
function getEnhancedDefaultReasons(query, doc, language = 'ja') {
  if (language === 'en') {
    return {
      reason_title_1: `High Expertise in "${query}" Field and Strategic Alignment with Corporate Needs`,
      reason_body_1: `Dr. ${doc.name}'s research domain demonstrates exceptional alignment with corporate challenges in "${query}". With ${doc.paper_count} published papers, this researcher has developed systematic and comprehensive academic insights through continuous research activities, building extensive knowledge spanning from theory to practice. The expertise in ${doc.classified_field} serves as a valuable resource for addressing complex challenges such as digital transformation, sustainability, and innovation creation that modern corporations face. In collaborative research with corporations, comprehensive support is expected from fundamental understanding of existing business challenges to proposing innovative approaches utilizing latest research findings and formulating specific roadmaps for implementation.`,
      reason_title_2: `International Research Impact and Academic Excellence Proven by ${doc.cited_by_count} Citations`,
      reason_body_2: `Dr. ${doc.name}'s research demonstrates high-quality outcomes that are internationally recognized and widely referenced in the global academic community, as evidenced by ${doc.cited_by_count} citations. The h-index of ${doc.h_index} objectively indicates not only high publication volume but also quality and impact of individual research, establishing a position as a leading researcher in the ${doc.classified_field} field. Such achievements suggest potential to not only conduct contract research but also enhance corporate R&D strategies and improve international competitiveness in collaborative research with corporations.`,
      reason_title_3: `Technology Innovation and Sustainable Competitive Advantage Creation through Industry-Academia Collaboration`,
      reason_body_3: `Collaborative research with Dr. ${doc.name} is expected to build strategic partnerships that contribute to establishing long-term competitive advantages rather than mere one-time technology development. By integrating cutting-edge academic insights with practical corporate needs, innovative solutions can be developed that serve as differentiation factors in existing markets and provide first-mover advantages in new markets. The expertise in "${query}" enables valuable advice for medium to long-term technology roadmaps and strategic investment decisions for next-generation technologies.`
    };
  } else {
    return {
      reason_title_1: `「${query}」分野における高度な専門性と企業ニーズとの戦略的適合性`,
      reason_body_1: `${doc.name}博士の研究領域は、「${query}」に関する企業の課題解決に直接的に貢献できる高度な専門性を有しています。${doc.paper_count}件の論文実績が示すように、継続的かつ体系的な研究活動を通じて深い学術的知見を蓄積しており、理論から実践までの幅広い知識基盤を構築しています。特に${doc.classified_field}分野での専門性は、現代企業が直面するデジタル変革、持続可能性、イノベーション創出などの複合的課題に対して、学術的根拠に基づいた解決策を提供できる貴重な資源です。企業との共同研究においては、既存の事業課題の本質的理解から始まり、最新の研究成果を活用した革新的アプローチの提案、そして実装に向けた具体的なロードマップの策定まで、包括的な支援が期待できます。`,
      reason_title_2: `${doc.cited_by_count}回の被引用実績が証明する国際的研究影響力と学術的卓越性`,
      reason_body_2: `${doc.name}博士の研究は、${doc.cited_by_count}回という被引用数が示すように、国際的な学術コミュニティにおいて高く評価され、広く参照されている質の高い成果を継続的に産出しています。h指数${doc.h_index}は、単に論文数が多いだけでなく、個々の研究の影響力と質を兼ね備えていることを客観的に示しており、この数値は${doc.classified_field}分野における第一線の研究者としての地位を確立していることを意味します。このような実績は、企業との共同研究において、単なる受託研究にとどまらず、企業の研究開発戦略そのものを高度化し、国際競争力を向上させる原動力となることが期待できます。また、豊富な研究経験と実績に基づく深い洞察力により、企業が見落としがちな潜在的課題の発見や、従来のアプローチでは解決困難な問題に対する革新的解決策の提案が可能です。`,
      reason_title_3: `産学連携による技術革新と持続可能な競争優位性の創出可能性`,
      reason_body_3: `${doc.name}博士との共同研究は、単発的な技術開発にとどまらず、企業の長期的な競争優位性確立に寄与する戦略的パートナーシップの構築が期待できます。学術研究の最前線で培われた知見と企業の実践的ニーズを融合させることで、既存の市場においては差別化要因となり、新規市場においては先行者利益を獲得できる革新的ソリューションの開発が可能となります。特に「${query}」領域における最新の研究動向と将来展望に精通していることから、中長期的な技術ロードマップの策定や、次世代技術への戦略的投資判断において貴重な助言を得ることができます。さらに、${doc.institution}という世界トップクラスの研究機関における研究環境と人的ネットワークを活用することで、グローバルな研究コラボレーションの機会創出や、国際的な技術標準化活動への参画など、企業単独では困難な戦略的活動への道筋も開かれることが期待されます。`
    };
  }
}

// ===== API エンドポイント =====

app.get("/", (req, res) => {
  res.status(200).json({ 
    status: "Server is running", 
    message: "Harvard Researcher Matching API - Multilingual Enhanced Reason Generation",
    timestamp: new Date().toISOString(),
    version: "3.2.0",
    features: [
      "Research data aggregation by author",
      "Multilingual AI reason generation (Japanese/English)",
      "Enhanced prompting for detailed explanations",
      "International user support"
    ],
    description: "Aggregates multiple CSV rows per researcher into single author records with multilingual reasoning"
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "3.2.0",
    index: AZURE_SEARCH_INDEX,
    features: [
      "Data aggregation enabled",
      "Multilingual reason generation (Japanese/English)",
      "Enhanced 500-word explanations per reason",
      "International UI support"
    ]
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
      processing: "Aggregate by author_name + Multilingual AI reasoning",
      output: "Author-level statistics with detailed multilingual reasons"
    }
  });
});

// ✅ メイン検索エンドポイント（多言語対応版）
app.post("/api/search", async (req, res) => {
  console.log("🔍 Multilingual enhanced aggregated search endpoint called");
  const { query, university, research_field, language = 'ja' } = req.body;
  
  if (!query || query.trim() === "") {
    const errorMsg = language === 'en' ? 
      "Please enter a research topic" : 
      "研究トピックを入力してください";
    return res.status(400).json({ error: errorMsg });
  }

  try {
    console.log(`🔍 多言語詳細理由生成版検索開始: "${query}" (${language})`);
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

    // Step 4: データ整形 + AI理由生成（多言語版）
    const results = await Promise.all(
      aggregatedDocuments.slice(0, 10).map(async (doc) => {
        const formatted = formatAggregatedResearcherData(doc);
        const reasons = await generateReason(query, formatted, language);
        return { ...formatted, ...reasons };
      })
    );

    console.log(`✅ 多言語詳細理由生成版検索完了: ${results.length}件の研究者`);
    
    // 結果確認
    results.forEach((result, index) => {
      console.log(`📊 研究者${index + 1}: ${result.name}`);
      console.log(`   - 集約論文数: ${result.paper_count}`);
      console.log(`   - 集約被引用数: ${result.cited_by_count}`);
      console.log(`   - h指数: ${result.h_index}`);
      console.log(`   - 分野: ${result.classified_field}`);
      console.log(`   - 理由1文字数: ${result.reason_body_1?.length || 0}`);
    });
    
    res.status(200).json(results);
    
  } catch (error) {
    console.error("❌ 多言語詳細理由生成版検索エラー:", error);
    const errorMsg = language === 'en' ? 
      "An error occurred during search" : 
      "検索中にエラーが発生しました";
    res.status(500).json({ 
      error: errorMsg,
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
  console.log(`✅ Multilingual Enhanced Reason Generation Server started on port ${PORT}`);
  console.log(`🎯 Features: Data aggregation + Multilingual AI reasoning (Japanese/English)`);
  console.log(`📊 Data flow: CSV rows → Author grouping → Detailed aggregated metrics + Multilingual AI reasons`);
  console.log(`📋 Index: ${AZURE_SEARCH_INDEX}`);
  console.log(`💡 AI: Enhanced reasoning with 3000 max_tokens for detailed multilingual explanations`);
  console.log(`🌐 Languages: Japanese (ja) / English (en)`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));