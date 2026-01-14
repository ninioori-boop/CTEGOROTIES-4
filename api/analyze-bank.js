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

  const { text, bankName } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const API_KEY = process.env.OPENAI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // הגבלת אורך הטקסט
  const cleanText = text.substring(0, 20000);

  const systemMessage = `אתה מנתח דפי חשבון עו"ש ישראלי. החזר JSON: {"expenses":[{"description":"שם","amount":123,"category":"קטגוריה"}]}

⛔ התעלם לגמרי מ (אלה לא הוצאות!):
- תשלומי כרטיס אשראי: מקס איט, MAX, ישראכרט, כאל, לאומי קארד, דיינרס, ויזה
- הכנסות: מכירה/, ריבית זכות, מילואים, משכורת, זיכוי, הפקדה
- השקעות: קניה/, מכירה/, אלטשולר, מגדל, אקסלנס, מיטב, קרן כספית
- המרות מטח: קיזוז מטח, מט"ח, המרה
- מיסים על רווחים: מס בגין ריבית, תנועת מס
- יתרות וסיכומים: יתרה, סה"כ, סיכום
- כל שורה עם סכום בעמודת "זכות" (זה הכנסה!)

✅ חלץ רק הוצאות אמיתיות:
- קופות חולים: מכבי, כללית, מאוחדת, לאומית
- חשבונות: חשמל, מים, ביוב, גז, ארנונה
- דיור: שכר דירה, משכנתא, ועד בית
- ביטוח: ביטוח לאומי, הראל, מגדל
- הלוואות והחזרים
- משיכות מזומן
- העברות בביט
- תרומות והוראות קבע

קטגוריות:
קופת חולים, חשמל, גז, מים וביוב, ארנונה, שכר דירה, משכנתא, דמי ניהול בניין, ביטוח לאומי, ביטוח, החזר הלוואות, מזומן ללא מעקב, תרומות, עמלות בנק ואשראי, ביט ללא מעקב, שונות

דוגמאות:
✅ "מכבי שירותי בריאות 309" → קופת חולים
✅ "חברת החשמל 450" → חשמל
✅ "מי גת 120" → מים וביוב
✅ "פאזגז 85" → גז
✅ "ארנונה עיריית 890" → ארנונה
✅ "ביטוח לאומי 904" → ביטוח לאומי
✅ "משיכת מזומן 500" → מזומן ללא מעקב
✅ "העברה בביט 300" → ביט ללא מעקב
✅ "ועד בית 350" → דמי ניהול בניין
✅ "מיי טאוור 472" → דמי ניהול בניין

❌ "מקס איט פיננסים 3500" → התעלם (תשלום אשראי)
❌ "קניה/אלטשולר 15000" → התעלם (השקעה)
❌ "מכירה/קרן כספית 5000" → התעלם (זו הכנסה!)
❌ "ריבית זכות 45" → התעלם (הכנסה)

חשוב: אם אין הוצאות אמיתיות, החזר {"expenses":[]}`;

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
          { role: 'system', content: systemMessage },
          { role: 'user', content: cleanText }
        ],
        max_tokens: 8000,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('OpenAI Error:', err);
      return res.status(500).json({ error: err.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      let result = JSON.parse(content);
      
      // סינון נוסף אחרי AI
      if (result.expenses && Array.isArray(result.expenses)) {
        const ignorePatterns = [
          'מקס', 'max', 'ישראכרט', 'כאל', 'לאומי קארד', 'דיינרס', 'ויזה',
          'קניה/', 'מכירה/', 'אלטשולר', 'מגדל קרנות', 'אקסלנס', 'מיטב',
          'קרן כספית', 'ריבית זכות', 'מילואים', 'משכורת', 'זיכוי',
          'קיזוז', 'מט"ח', 'המרה', 'מס בגין', 'תנועת מס',
          'יתרה', 'סה"כ', 'סיכום', 'הפקדה', 'העברה לחשבון'
        ];
        
        result.expenses = result.expenses.filter(exp => {
          if (!exp || !exp.description) return false;
          
          const desc = exp.description.toLowerCase();
          const shouldIgnore = ignorePatterns.some(pattern => 
            desc.includes(pattern.toLowerCase())
          );
          
          // סנן גם סכומים גבוהים מאוד שכנראה הם לא הוצאות רגילות
          if (exp.amount > 5000 && 
              !['משכנתא', 'שכר דירה', 'ביטוח לאומי'].includes(exp.category)) {
            console.log(`⚠️ סינון סכום גבוה: ${exp.description} - ${exp.amount}`);
            return false;
          }
          
          if (shouldIgnore) {
            console.log(`🚫 סינון אחרי AI: ${exp.description}`);
            return false;
          }
          
          return true;
        });
      }
      
      return res.status(200).json(result);
    } catch (parseError) {
      // נסה לחלץ JSON מהתשובה
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return res.status(200).json(result);
      }
      return res.status(500).json({ error: 'Invalid AI response format' });
    }

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
