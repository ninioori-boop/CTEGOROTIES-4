module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { businesses } = req.body || {};

  if (!businesses || !Array.isArray(businesses) || businesses.length === 0) {
    return res.status(400).json({ error: 'No businesses provided' });
  }

  const API_KEY = process.env.OPENAI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const maxBusinesses = businesses.slice(0, 30);

  const allowedCategories = [
    'מזון לבית', 'אוכל בחוץ ובילויים', 'תחביבים', 'תקשורת', 'ביטוח',
    'בריאות', 'דלק וחניה', 'תחבצ', 'ביגוד והנעלה', 'פארם',
    'תספורת וקוסמטיקה', 'מתנות', 'כבישי אגרה', 'חופשה וטיול',
    'תיקוני רכב', 'בעלי חיים', 'ביט ללא מעקב', 'מזומן ללא מעקב',
    'מיסים', 'דמי ניהול בניין', 'עמלות בנק ואשראי', 'משכנתא',
    'שכר דירה', 'הוצאות בית', 'קופת חולים', 'ביטוח לאומי',
    'חינוך וקייטנות', 'תרומות', 'החזר הלוואות', 'ריהוט והבית',
    'צעצועים', 'עוזרת בית', 'סיגריות', 'ציוד עסקי/משרדי', 'שונות'
  ];

  const businessList = maxBusinesses
    .map((b, i) => `${i + 1}. "${b.description}"`)
    .join('\n');

  const systemMessage = `אתה עוזר לזהות עסקים ישראליים ולסווג אותם לקטגוריות הוצאה.
עבור כל עסק שתקבל, חפש באינטרנט מה זה העסק ומה הוא מוכר/מספק.
לאחר מכן, סווג אותו לאחת מהקטגוריות הבאות בלבד:

${allowedCategories.join(', ')}

החזר JSON בלבד בפורמט:
{"results":[{"description":"שם העסק בדיוק כפי שקיבלת","category":"הקטגוריה","confidence":"high/medium/low"}]}

כללים:
- confidence = "high" אם מצאת מידע ברור על העסק
- confidence = "medium" אם הסקת מהשם או ממידע חלקי
- confidence = "low" אם לא מצאת מידע ברור – במקרה זה שים "שונות"
- השתמש רק בקטגוריות מהרשימה! אסור להמציא קטגוריות חדשות
- אם העסק הוא מסעדה/בית קפה/אוכל מוכן → "אוכל בחוץ ובילויים"
- אם העסק הוא סופרמרקט/מכולת → "מזון לבית"
- אם העסק הוא חנות בגדים/אופנה → "ביגוד והנעלה"
- אם העסק הוא רשת דלק → "דלק וחניה"
- אם העסק הוא בית מרקחת/פארם → "פארם"
- אם העסק הוא חנות רהיטים/לבית → "ריהוט והבית"
- "הוצאות בית" כולל: ארנונה, חשמל, גז, מים וביוב
- חברות ביטוח (הראל, מגדל, הפניקס, כלל, מנורה) → תמיד "ביטוח"
- קופות חולים (מכבי, כללית, מאוחדת, לאומית) → "קופת חולים"
- ביטוח לאומי → "ביטוח לאומי" (קטגוריה נפרדת מביטוח!)`;

  const userMessage = `חפש באינטרנט וזהה את העסקים הישראליים הבאים. עבור כל אחד, קבע לאיזו קטגוריית הוצאה הוא שייך:

${businessList}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-search-preview',
        web_search_options: {
          search_context_size: 'low',
          user_location: {
            type: 'approximate',
            country: 'IL'
          }
        },
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('OpenAI Search Error:', err);
      return res.status(500).json({ error: err.error?.message || 'OpenAI search error' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      const result = JSON.parse(content);
      return res.status(200).json(result);
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return res.status(200).json(result);
      }
      return res.status(500).json({ error: 'Invalid AI search response format', raw: content.substring(0, 500) });
    }

  } catch (error) {
    console.error('Search Server Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
