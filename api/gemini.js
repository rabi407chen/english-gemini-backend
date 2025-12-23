const { GoogleGenerativeAI } = require("@google/generative-ai");
const multiparty = require("multiparty");
const fs = require("fs");

export const config = {
  api: {
    bodyParser: false, // 關閉預設解析，改用 multiparty 處理圖片上傳
  },
};

export default async function handler(req, res) {
  // 1. 處理 CORS (允許跨域)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 2. 解析上傳的圖片
    const form = new multiparty.Form();
    const data = await new Promise((resolve, reject) => {
      form.parse(req, function (err, fields, files) {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    // 檢查是否有圖片
    if (!data.files.file || data.files.file.length === 0) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const imageFile = data.files.file[0];
    const imageBuffer = fs.readFileSync(imageFile.path);
    const base64Image = imageBuffer.toString("base64");

    // 3. 呼叫 Google Gemini API
    const apiKey = process.env.GEMINI_API_KEY; // 從 Vercel 環境變數讀取 Key (安全!)
    
    if (!apiKey) {
      return res.status(500).json({ error: "API Key not configured on server" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // 設定 Prompt (你可以隨時調整這裡來改變 AI 的行為)
    const prompt = `
      你是一個專業的英文老師。請分析這張圖片中的英文內容：
      1. 辨識所有英文文字 (OCR)，自動修正斷行，合併跨頁或雙欄文章。
      2. 提供繁體中文翻譯。
      3. 挑選 5-10 個重要單字或片語，提供詞性、定義(英文)與繁體中文解釋。
      
      請直接回傳純 JSON 格式，不要用 Markdown 包裹，格式如下：
      {
        "english": "完整的英文文章...",
        "chinese": "完整的中文翻譯...",
        "vocab": [
           {"word": "apple", "part": "n.", "def": "A round fruit...", "trans": "蘋果"},
           ...
        ]
      }
    `;

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/jpeg",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // 4. 清理 JSON 字串 (Gemini 有時會包 ```json ... ```)
    const jsonString = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonResponse = JSON.parse(jsonString);

    // 5. 回傳給前端
    res.status(200).json(jsonResponse);

  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}

