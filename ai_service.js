const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "");

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

// Helper to safely join array or parse JSON string
function safeJoin(val) {
  if (!val) return "";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.join(", ");
    } catch (e) { }
    return val; // Return raw string if not JSON array
  }
  return "";
}

async function analyzeImage(imagePath, context = null, lang = 'en') {
  if (!process.env.GEMINI_API_KEY) {
    console.log("No API Key provided, returning mock analysis.");
    return mockAnalysis();
  }

  try {
    // Use gemini-3-flash-preview as requested
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // --- CONTEXT PREPARATION ---
    let contextInstruction = "";

    if (context) {
      const ageInfo = context.age_desc || "Unknown Age";

      // BABY LOGIC (< 1 year)
      if (context.is_baby) {
        const feeding = context.baby_feeding || "Unknown feeding";
        const stage = context.baby_stage || "Unknown stage";

        if (lang === 'zh') {
          contextInstruction = `
                重要背景 - 对象是婴儿 (${ageInfo}):
                - 喂养方式: ${feeding}.
                - 饮食阶段: ${stage}.
                - 规则: 母乳喂养的婴儿，黄色/颗粒状/稀便 是正常的 (黄金标准)，不要标记为腹泻。
                - 规则: 如果"刚添加辅食"，未消化的食物(胡萝卜/玉米)是正常的。
                - 规则: 绿色大便通常是正常的(快速通过/铁元素)，只有伴随粘液/血时才需警惕。
            `;
        } else {
          contextInstruction = `
                IMPORTANT CONTEXT - SUBJECT IS A BABY (${ageInfo}):
                - Feeding Method: ${feeding}.
                - Diet Stage: ${stage}.
                - RULE: For breastfed babies, yellow/seeded/liquid stool IS NORMAL (Gold Standard). Do NOT flag as diarrhea.
                - RULE: If "New to solids", undigested food (carrots/corn) is NORMAL.
                - RULE: Green stool is often normal (rapid transit/iron), only warn if accompanied by mucus/blood.
            `;
        }
      }
      // ADULT LOGIC (> 12 years)
      else {
        const health = safeJoin(context.adult_health);
        const meds = safeJoin(context.adult_meds);

        if (lang === 'zh') {
          contextInstruction = `
                重要背景 - 对象是成人 (${ageInfo}):
                - 已知状况: ${health}.
                - 药物: ${meds}.
                - 规则: 胆囊切除者，黄色/油腻大便是预期的。
                - 规则: 服用铁剂者，黑色/绿色大便是预期的 (非出血)。
                - 规则: IBS患者，粘液可能是慢性的 (提及即可，不必恐慌)。
            `;
        } else {
          contextInstruction = `
                IMPORTANT CONTEXT - SUBJECT IS AN ADULT (${ageInfo}):
                - Known Conditions: ${health}.
                - Medications: ${meds}.
                - RULE: If user has "Gallbladder Removal", yellow/greasy stool is expected.
                - RULE: If user takes "Iron Supplements", Black/Green stool is expected (NOT bleeding).
                - RULE: If user has "IBS", mucus might be chronic (mention it but don't panic).
            `;
        }
      }
    }

    let prompt = "";
    if (lang === 'zh') {
      prompt = `
        你是一名专业的胃肠科AI医疗助手。分析这张粪便照片并返回纯JSON格式的响应。
        
        ${contextInstruction}

        严格规则:
        1. 有效性检查: 首先判断图片是否明确包含马桶/便盆中的粪便。如果是人脸、身体部位、食物或随机物体，设 "is_stool" 为 false 并在 "rejection_reason" 中简短解释 (中文)。
        
        请返回有效的 JSON。所有 Key 必须保留英文，Value 使用中文。
        数据结构:
        {
           "validity": { "is_stool": boolean, "privacy_issue": boolean, "rejection_reason": string (optional, 中文) },
           "health_score": string, // 等级: A+, A, A-, B+, B, B-, C+, C, C-, D. (A=理想, B=轻微问题, C=中度, D=严重/血). 布里斯托4型是 A+.
           "short_summary": string, // 5-10个字，朗朗上口的中文描述。例如 "完美的香蕉状", "太硬了，多喝水！"
           "color_hex": string, // 近似十六进制颜色代码，例如 #8B4513
           "bristol": { "scale": number (1-7), "description": string (中文描述) },
           "color": { "primary": string (颜色名称 中文), "medical_disclaimer": string (可选, 中文医疗解释), "warning_level": "none"|"warning"|"danger" },
           "texture": { "has_mucus": boolean, "has_blood": boolean, "undigested_food": string[] (中文食物名), "is_greasy": boolean },
           "summary": string (2-3句中文医疗建议，结合背景: ${JSON.stringify(context)})
        }
        
        注意:
        - 如果 "is_stool" 为 false, 停止分析。
        - 语气: 专业、同理心。如果是成人可适当幽默，婴儿则需温柔。
        `;
    } else {
      prompt = `
        You are a medical AI assistant specializing in gastroenterology. Analyze this image of stool and return a purely JSON response.
        
        ${contextInstruction}

        STRICT RULES:
        1. VALIDITY CHECK: First, determine if the image definitely contains stool in a toilet/potty. If it is a face, body part, food, or random object, set "is_stool" to false and "rejection_reason" to a short explanation.
            
            Return ONLY valid JSON.
            Structure:
            {
               "validity": { "is_stool": boolean, "privacy_issue": boolean, "rejection_reason": string (optional) },
               "health_score": string, // Grade: A+, A, A-, B+, B, B-, C+, C, C-, D. (A=Ideal, B=Mild Issue, C=Moderate, D=Severe/Blood). Bristol 4 is A+.
               "short_summary": string, // 5-10 words, catchy description. e.g. "Perfect sausage shape", "Hard pellets, drink water!"
               "color_hex": string, // Approximate hex color code, e.g. #8B4513
               "bristol": { "scale": number (1-7), "description": string },
               "color": { "primary": string, "medical_disclaimer": string (optional), "warning_level": "none"|"warning"|"danger" },
               "texture": { "has_mucus": boolean, "has_blood": boolean, "undigested_food": string[], "is_greasy": boolean },
               "summary": string (2-3 sentences medical advice tailored to context: ${JSON.stringify(context)})
            }
            
            IMPORTANT:
            - If "is_stool" is false, stop there.
            - If it reveals faces or private parts, set "privacy_issue" to true and stop.
            - Be empathetic but humorous if appropriate for an adult, gentle for a baby.
            `;
    }

    const imageParts = [
      fileToGenerativePart(imagePath, "image/jpeg"),
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = response.text();

    // Clean up markdown code blocks if present
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return JSON.stringify({
      validity: { is_stool: true, privacy_issue: false },
      bristol: { scale: 0, description: "Analysis Failed" },
      summary: "AI Service Error: " + error.message,
      color: { primary: "unknown", warning_level: "none" },
      texture: { has_mucus: false, has_blood: false, undigested_food: [], is_greasy: false },
      volume: { estimation: "unknown", float_status: "unknown" }
    });
  }
}

function mockAnalysis() {
  const mockData = {
    validity: { is_stool: true, privacy_issue: false, rejection_reason: null },
    bristol: { scale: 4, description: "Smooth and soft, snake-like" },
    color: { primary: "brown", warning_level: "none", medical_disclaimer: null },
    texture: { has_mucus: false, has_blood: false, undigested_food: ["corn"], is_greasy: false },
    volume: { estimation: "medium", float_status: "sink" },
    summary: "Mock Data: All looks good!"
  };
  return JSON.stringify(mockData);
}

// --- TREND ANALYSIS ---
async function analyzeTrends(data, lang = 'en') {
  if (!process.env.GEMINI_API_KEY) {
    return mockTrendAnalysis();
  }

  try {
    // Use gemini-3-flash-preview as requested
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    let prompt = "";

    if (lang === 'zh') {
      prompt = `
        你是一名数据分析医疗助手。分析以下健康日志（粪便分析）并发现趋势、相关性和警告。
        
        输入数据:
        ${JSON.stringify(data, null, 2)}
        注意: 
        - effort: 排便费力程度 (1=轻松, 2=正常, 3=困难, 4=受阻)
        - sensation: 排空感 (complete=完全, incomplete=未排净)
        - context: 场景 (home, work, hotel, public)
        - features: AI分析的微观特征 (颜色、质地、是否有粘液/血)

        任务:
        1. 趋势发现: 查看时间轴。是否有便秘 (1-2型) 或 腹泻 (6-7型) 的时期？
        2. 相关性侦探: 
           - 饮食: '酒精' 是否导致第二天的 6/7 型？'辛辣食物' 是否导致 '灼烧感'？
           - 场景: 是否在 'work' 或 'public' 场景下更容易出现 'incomplete' (排不净) 或 'effort' (费力) 升高？
           - 努力度: 高努力度 (3-4) 是否总是伴随干硬大便 (1-2型)？
        3. 健康评分 (A-D): 
           - A+/A: 形态主要为 3-4型，且无出血/粘液。
           - B: 偶尔 1-2 或 5型。
           - C: 频繁的便秘/腹泻，或频繁的排不净感。
           - D: 出现血、持续的粘液、或长期的极端形态。
        4. 被动建议: 基于发现给出简短建议 (例如: "在公司时请多喝水", "注意乳制品摄入").

        输出格式 (仅JSON):
        请保留 Key 为英文，Value 为中文。
        {
          "grade": "A+" | "A" | "B" | "C" | "D",
          "summary": "一段中文总结，概括这段时期的状况，提及显著的场景或习惯影响",
          "correlations": [
            { "cause": "string (中文)", "effect": "string (中文)", "confidence": "High" | "Medium" }
          ],
          "alerts": [
            { "type": "warning" | "good", "message": "string (中文)" }
          ],
           "trends": [
            { "date": "YYYY-MM-DD", "value": number } // Bristol score
          ]
        }
        `;
    } else {
      prompt = `
        You are a Data Analyst Medical Agent. Analyze the following health logs (Stool Analysis) and find trends, correlations, and warnings.
        
        INPUT DATA:
        ${JSON.stringify(data, null, 2)}
        NOTE:
        - effort: Straining level (1=Easy, 2=Normal, 3=Hard, 4=Blocked)
        - sensation: Evacuation sensation (complete vs incomplete)
        - context: Location (home, work, hotel, public)
        - features: AI analyzed textures (color, blood, mucus, etc.)

        TASKS:
        1. TREND SPOTTING: Look at the timeline for Constipation (Type 1-2) or Diarrhea (Type 6-7).
        2. CORRELATION DETECTIVE: 
           - Diet: Does 'Alcohol' lead to Type 6/7? Does 'Spicy' lead to burning?
           - Context: Is 'incomplete' sensation or high 'effort' more common at 'work' or 'public' restrooms?
           - Effort: Does high effort (3-4) align with hard stool?
        3. GRADING (A-D):
           - A+/A = Mostly Type 3-4, no blood/mucus.
           - B = Occasional 1-2 or 5.
           - C = Frequent issues or frequent 'incomplete' sensation.
           - D = Blood, mucus, or chronic extreme types.

        OUTPUT SCHEMA (JSON ONLY):
        {
          "grade": "A+" | "A" | "B" | "C" | "D",
          "summary": "string summarizing the period, mentioning key context/habit factors",
          "correlations": [
            { "cause": "string", "effect": "string", "confidence": "High" | "Medium" }
          ],
          "alerts": [
            { "type": "warning" | "good", "message": "string" }
          ],
           "trends": [
            { "date": "YYYY-MM-DD", "value": number } // Bristol score
          ]
        }
    `;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return text;
  } catch (error) {
    console.error("Trend Analysis Error:", error);
    return mockTrendAnalysis();
  }
}

function mockTrendAnalysis() {
  return JSON.stringify({
    grade: "B",
    summary: "Mock Analysis: Everything looks stable.",
    correlations: [],
    alerts: [],
    trends: []
  });
}

module.exports = { analyzeImage, analyzeTrends };
