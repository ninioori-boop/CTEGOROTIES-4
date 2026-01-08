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
    .substring(0, 15000); // Limit text length

  const prompt = `אתה מומחה בניתוח דוחות הוצאות ישראליים. נתח את הטקסט הבא וחלץ את כל ההוצאות.

טקסט הדוח:
${cleanText}

קטגוריות אפשריות: מזון לבית, אוכל בחוץ ובילויים, פארם, דלק וחניה, מתנות לאירועים ולשמחות, ביגוד והנעלה, תחבצ, כבישי אגרה, תספורת וקוסמטיקה, תחביבים, סיגריות, חופשה וטיול, עוזרת ושמרטף, תיקוני רכב, בריאות, בעלי חיים, דמי כיס וילדים, יהדות וחגים, שונות, ביט ללא מעקב, מזומן ללא מעקב

כללים:
- BIT או ביט = ביט ללא מעקב
- SPOTIFY, NETFLIX, GOOGLE, חדר כושר = תחביבים
- סופרמרקט, מאפיה, מעדניה = מזון לבית
- מסעדה, בר, קפה, WOLT = אוכל בחוץ ובילויים
- משיכת מזומן = מזומן ללא מעקב

החזר JSON בפורמט הזה בלבד:`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a JSON-only response bot. Return only valid JSON, no markdown, no explanations. Format: {"expenses": [{"description": "name", "amount": 123.45, "category": "category"}]}'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4096,
        temperature: 0,
        response_format: { type: "json_object" }
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

    try {
      const result = JSON.parse(content);
      
      // Ensure expenses array exists
      if (!result.expenses) {
        result.expenses = [];
      }
      
      return res.status(200).json(result);
    } catch (parseError) {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          return res.status(200).json(result);
        } catch (e) {
          // ignore
        }
      }
      
      return res.status(500).json({ 
        error: 'שגיאה בניתוח התשובה. נסה שוב.',
        details: parseError.message
      });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
