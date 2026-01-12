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

  const prompt = `אתה מומחה בניתוח דוחות אשראי ישראליים. נתח את הטקסט וחלץ רק הוצאות אמיתיות.

טקסט הדוח:
${cleanText}

⚠️ התעלם לחלוטין מהדברים הבאים (אלה לא הוצאות!):
- מסגרת אשראי / מסגרת כרטיס / סך מסגרת
- נקודות / צבירת נקודות / ניצול נקודות / פירוט נקודות
- זיכויים / החזרים / זיכוי
- יתרה / יתרת חובה / יתרת זכות
- סיכומים כלליים / סך התחייבויות
- עמלות בנק / דמי כרטיס (אלא אם זו הוצאה בפועל)
- כל מספר שמופיע כחלק ממידע על החשבון ולא כעסקה

✅ חלץ רק עסקאות קנייה אמיתיות עם:
- שם בית העסק המדויק (לא לכתוב "שימוש במסעדה" אלא השם האמיתי!)
- סכום העסקה בש"ח

קטגוריות: מזון לבית, אוכל בחוץ ובילויים, פארם, דלק וחניה, מתנות לאירועים ולשמחות, ביגוד והנעלה, תחבצ, כבישי אגרה, תספורת וקוסמטיקה, תחביבים, סיגריות, חופשה וטיול, עוזרת ושמרטף, תיקוני רכב, בריאות, בעלי חיים, דמי כיס וילדים, יהדות וחגים, שונות, ביט ללא מעקב, מזומן ללא מעקב, תקשורת, ביטוח

כללים לקיטלוג:
- BIT / ביט / העברת ביט = ביט ללא מעקב
- SPOTIFY, NETFLIX, GOOGLE PLAY, חדר כושר, אמזון = תחביבים  
- רמי לוי, שופרסל, יוחננוף, ויקטורי, מאפיה, מעדניה, AM:PM = מזון לבית
- מסעדה, בר, קפה, פיצה, WOLT, תן ביס, המבורגר = אוכל בחוץ ובילויים
- משיכת מזומן / כספומט = מזומן ללא מעקב
- HOT, YES, סלקום, פרטנר, הוט מובייל = תקשורת
- מכבי, כללית, לאומית, מאוחדת, רפואה, שיניים, מכבידנט = בריאות
- ביטוח לאומי, ביטוח = ביטוח
- סונול, פז, דלק, yellow, פנגו, חניון = דלק וחניה
- פוקס, קסטרו, H&M, זארה, רנואר = ביגוד והנעלה
- סופר פארם, BE, בי = פארם

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
            content: `You are an expert Israeli credit card expense analyzer. Return ONLY valid JSON.

CRITICAL RULES:
1. ONLY extract ACTUAL purchases/transactions from merchants
2. NEVER include: credit limits, points, balances, summaries, refunds (זיכוי/החזר), fees info
3. Use the EXACT merchant name from the document (e.g. "אורלי מרדכי the bakery" not "מאפיה")
4. Amount must be the transaction amount in ILS (שקלים)
5. If unsure whether something is an expense, DO NOT include it

Format: {"expenses": [{"description": "exact merchant name", "amount": 123.45, "category": "category"}]}`
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
