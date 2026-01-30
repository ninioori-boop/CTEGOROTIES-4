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
- תשלומי כרטיס אשראי: מקס איט, MAX, ישראכרט, כאל, לאומי קארד, דיינרס, ויזה CAL
- הכנסות: מכירה/, ריבית זכות, מילואים, משכורת, זיכוי, הפקדה, העברה מחשבון
- השקעות: קניה/, מכירה/, אלטשולר, מגדל קרנות, אקסלנס, מיטב, קרן כספית, IBI
- המרות מטח: קיזוז מטח, מט"ח, המרה, פקדון
- מיסים על רווחים: מס בגין ריבית, תנועת מס, ניכוי מס
- יתרות וסיכומים: יתרה, סה"כ, סיכום, פתיחה
- כל שורה עם סכום בעמודת "זכות" = הכנסה!

✅ חלץ רק הוצאות אמיתיות:
- קופות חולים: מכבי שירותי בריאות, כללית, מאוחדת, לאומית
- חשמל: חברת החשמל, סופר-פאוור, בזק אנרגיה
- מים: מי אביבים, הגיחון, מי כרמל, מי גת, מי נתניה, מי הרצליה, פלג הגליל
- גז: פזגז, סופרגז, אמישראגז, דורגז
- ארנונה: עיריית..., ארנונה
- דיור: שכר דירה, משכנתא, דירה להשכיר, עמידר
- ניהול בניין: ועד בית, מיי טאוור, אדן ניהול, קלינטון
- ביטוח: ביטוח לאומי, הראל, מגדל, הפניקס, כלל, מנורה, איילון
- הלוואות: מימון ישיר, בלנדר, טריא, החזר הלוואה
- מזומן: משיכת מזומן, משיכה בכספומט
- ביט: העברה בביט, BIT
- תרומות: יד שרה, לתת, עזר מציון, מד"א, זק"א

קטגוריות זמינות:
קופת חולים, חשמל, גז, מים וביוב, ארנונה, שכר דירה, משכנתא, דמי ניהול בניין, ביטוח לאומי, ביטוח, החזר הלוואות, מזומן ללא מעקב, תרומות, עמלות בנק ואשראי, ביט ללא מעקב, חינוך וקייטנות, ציוד עסקי/משרדי, שונות

דוגמאות לקטגוריזציה נכונה:
✅ "מכבי שירותי בריאות 309" → קופת חולים
✅ "שירותי בריאות כללית 250" → קופת חולים
✅ "חברת החשמל 450" → חשמל
✅ "מי אביבים 120" → מים וביוב
✅ "הגיחון 95" → מים וביוב
✅ "פזגז 85" → גז
✅ "סופרגז 70" → גז
✅ "ארנונה עיריית תל אביב 890" → ארנונה
✅ "עיריית ירושלים 750" → ארנונה
✅ "ביטוח לאומי 904" → ביטוח לאומי
✅ "הראל ביטוח 350" → ביטוח
✅ "משיכת מזומן 500" → מזומן ללא מעקב
✅ "העברה בביט 300" → ביט ללא מעקב
✅ "ועד בית 350" → דמי ניהול בניין
✅ "מיי טאוור 472" → דמי ניהול בניין
✅ "יד שרה 100" → תרומות
✅ "עמלת ניהול 25" → עמלות בנק ואשראי

❌ "מקס איט פיננסים 3500" → התעלם
❌ "קניה/אלטשולר 15000" → התעלם
❌ "מכירה/קרן כספית 5000" → התעלם
❌ "ריבית זכות 45" → התעלם
❌ "משכורת 12000" → התעלם
❌ "הפקדה 5000" → התעלם

חשוב: אם אין הוצאות אמיתיות, החזר {"expenses":[]}

=== החזרים כספיים (קריטי!) ===
- אם הסכום הוא שלילי (מינוס) - זה החזר כספי!
- שמור את הסימן השלילי ב-amount! לדוגמה: -65.2
- החזרים יכולים להופיע כ: "-65.2" או "(65.2)" או "65.2-"
- תמיד שמור החזרים עם סכום שלילי!`;

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
          // תשלומי אשראי
          'מקס', 'max', 'ישראכרט', 'כאל', 'לאומי קארד', 'דיינרס', 'ויזה', 'visa',
          // השקעות
          'קניה/', 'מכירה/', 'אלטשולר', 'מגדל קרנות', 'אקסלנס', 'מיטב', 'ibi',
          'קרן כספית', 'פקדון', 'תעודת סל', 'קרן נאמנות',
          // הכנסות
          'ריבית זכות', 'מילואים', 'משכורת', 'זיכוי', 'החזר', 'העברה מחשבון',
          // מיסים על רווחים
          'קיזוז', 'מט"ח', 'המרה', 'מס בגין', 'תנועת מס', 'ניכוי מס',
          // יתרות
          'יתרה', 'סה"כ', 'סיכום', 'הפקדה', 'העברה לחשבון', 'פתיחה', 'סגירה'
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
