// server.js または routes/search.js に記載

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Azure Search 環境変数（.env or AppService 設定から取得）
const AZURE_SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const AZURE_SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY;
const AZURE_SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX_NAME || "harvard-index";  // 適宜変更

// POST /api/search
app.post("/api/search", async (req, res) => {
  const { country, university, query } = req.body;

  // Azure Search の検索クエリ構成
  const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX}/docs/search?api-version=2023-07-01-Preview`;

  const headers = {
    "Content-Type": "application/json",
    "api-key": AZURE_SEARCH_API_KEY,
  };

  const payload = {
    search: query,
    filter: `university eq '${university}'`,
    top: 10
  };

  try {
    const response = await axios.post(url, payload, { headers });
    const hits = response.data.value || [];

    const results = hits.map(doc => ({
      title: doc.title,
      abstract: doc.abstract
    }));

    res.json(results);
  } catch (err) {
    console.error("Search API error:", err.response?.data || err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
