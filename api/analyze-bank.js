module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, bankName } = req.body || {};
  console.log('Bank API called. Bank:', bankName, 'Text length:', text?.length || 0);
  
  if (!text) return res.status(400).json({ error: 'No data provided' });

  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 15000);

  const systemMessage = `אתה מנתח דפי חשבון עו"ש ישראלי. החזר JSON בפורמט: {"expenses":[{"description":"שם","amount":123,"category":"קטגוריה"}]}

התעלם מ: תשלומי כרטיס אשראי (מקס, MAX, ישראכרט, כאל, לאומי קארד), קיזוז מטח, ריבית, עסקאות מט"ח, יתרות, סיכומים, השקעות (אלטשולר, מגדל, אקסלנס)

חלץ רק הוצאות אמיתיות כמו: חשבון חשמל, מים, גז, ארנונה, שכר דירה, משכנתא, קופות חולים, ביטוח לאומי, הוראות קבע, משיכות מזומן, העברות

קטגוריות: שכר דירה, משכנתא, חשמל, גז, מים, ארנונה, ועד בית, קופת חולים, ביטוח לאומי, הלוואות, מזומן ללא מעקב, העברות, שונות

חשוב: אם אין הוצאות רלוונטיות, החזר {"expenses":[]}`;

  const userPrompt = `דף חשבון מבנק ${bankName || 'לא ידוע'}. חלץ את ההוצאות האמיתיות בלבד:\n${cleanText}`;

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
        max_tokens: 4000,
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('OpenAI error:', err);
      return res.status(500).json({ error: err.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log('OpenAI response length:', content?.length || 0);

    if (!content) {
      return res.status(500).json({ error: 'No response from AI', expenses: [] });
    }

    let cleanContent = content.replace(/[\u0000-\u001F]+/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').trim();

    try {
      const result = JSON.parse(cleanContent);
      if (!result.expenses) result.expenses = [];
      
      // Filter out credit card payments and investments
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        const desc = (exp.description || '').toLowerCase();
        const ignore = ['מקס', 'max', 'ישראכרט', 'כאל', 'אלטשולר', 'מגדל', 'אקסלנס', 'קיזוז', 'ריבית זכות', 'יתרה', 'קניה/', 'מכירה/', 'לאומי קארד'];
        return !ignore.some(i => desc.includes(i));
      });
      
      console.log('Returning', result.expenses.length, 'bank expenses');
      return res.status(200).json(result);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      const match = cleanContent.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const result = JSON.parse(match[0]);
          if (!result.expenses) result.expenses = [];
          console.log('Fallback: returning', result.expenses.length, 'expenses');
          return res.status(200).json(result);
        } catch (e2) {
          console.error('Fallback parse error:', e2.message);
        }
      }
      return res.status(200).json({ expenses: [], error: 'Parse error but returning empty' });
    }
  } catch (error) {
    console.error('Bank API error:', error.message);
    return res.status(500).json({ error: error.message, expenses: [] });
  }
};
