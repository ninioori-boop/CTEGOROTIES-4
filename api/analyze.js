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

  const { text } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const API_KEY = process.env.OPENAI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Clean the text from problematic characters
  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 12000);

  const systemMessage = 'You are an Israeli credit card expense analyzer. Return ONLY valid JSON with format: {"expenses": [{"description": "merchant name", "amount": 123.45, "category": "category"}]}. NEVER include credit limits, points, refunds, balances, or summaries. ONLY real purchase transactions.';

  const userPrompt = 'נתח את דוח האשראי הבא וחלץ רק עסקאות קנייה אמיתיות. התעלם ממסגרת אשראי, נקודות, זיכויים, החזרים, יתרות וסיכומים. שמור את שם בית העסק המדויק. קטגוריות אפשריות: מזון לבית, אוכל בחוץ ובילויים, פארם, דלק וחניה, מתנות, ביגוד והנעלה, תחבצ, כבישי אגרה, תספורת וקוסמטיקה, תחביבים, סיגריות, חופשה וטיול, עוזרת ושמרטף, תיקוני רכב, בריאות, בעלי חיים, דמי כיס וילדים, יהדות וחגים, שונות, ביט ללא מעקב, מזומן ללא מעקב, תקשורת, ביטוח. כללים: BIT/ביט=ביט ללא מעקב, SPOTIFY/NETFLIX/אמזון=תחביבים, סופרמרקט/מאפיה=מזון לבית, מסעדה/קפה/WOLT=אוכל בחוץ ובילויים, HOT/סלקום=תקשורת, מכבי/כללית/מכבידנט=בריאות, סונול/פז/דלק=דלק וחניה. הדוח: ' + cleanText;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4096,
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ 
        error: err.error?.message || 'OpenAI error'
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Clean the content before parsing
    let cleanContent = content
      .replace(/[\u0000-\u001F]+/g, ' ')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .trim();

    try {
      const result = JSON.parse(cleanContent);
      
      // Ensure expenses array exists and filter out bad entries
      if (!result.expenses) {
        result.expenses = [];
      }
      
      // Filter out entries that look like limits/points/summaries
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        const desc = exp.description.toLowerCase();
        const badWords = ['מסגרת', 'נקודות', 'יתרה', 'סיכום', 'התחייבות', 'זיכוי', 'החזר', 'עמלה'];
        return !badWords.some(word => desc.includes(word));
      });
      
      return res.status(200).json(result);
    } catch (parseError) {
      // Try to extract JSON from response
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          if (result.expenses) {
            return res.status(200).json(result);
          }
        } catch (e) {
          // ignore
        }
      }
      
      return res.status(500).json({ 
        error: 'שגיאה בניתוח התשובה. נסה שוב.',
        details: parseError.message,
        raw: cleanContent.substring(0, 200)
      });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
