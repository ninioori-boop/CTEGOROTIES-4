module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, bankName } = req.body || {};
  if (!text) return res.status(400).json({ error: 'No data provided' });

  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 15000);

  const systemMessage = `Israeli bank (עו"ש) analyzer. Return JSON: {"expenses":[{"description":"name","amount":123,"category":"cat"}]}

IGNORE (NOT expenses): מקס, MAX, ישראכרט, כאל, קיזוז מטח, ריבית, אלטשולר, מגדל, אקסלנס, יתרה, סה"כ, קניה/, מכירה/

ONLY real bills: חשמל, מים, גז, ארנונה, שכר דירה, משכנתא, מכבי, כללית, ביטוח לאומי, משיכת מזומן

CATEGORIES: שכר דירה, משכנתא, חשמל, גז, מים, ארנונה, ועד בית, קופת חולים, ביטוח לאומי, הלוואות, מזומן ללא מעקב, שונות`;

  const userPrompt = `Bank statement from ${bankName || 'bank'}. Extract ONLY real bills (NOT credit card payments):\n${cleanText}`;

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
      return res.status(500).json({ error: err.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let cleanContent = content.replace(/[\u0000-\u001F]+/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').trim();

    try {
      const result = JSON.parse(cleanContent);
      if (!result.expenses) result.expenses = [];
      
      // Filter out credit card payments and investments
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        const desc = exp.description.toLowerCase();
        const ignore = ['מקס', 'max', 'ישראכרט', 'כאל', 'אלטשולר', 'מגדל', 'אקסלנס', 'קיזוז', 'ריבית', 'יתרה', 'קניה/', 'מכירה/'];
        return !ignore.some(i => desc.includes(i));
      });
      
      return res.status(200).json(result);
    } catch (e) {
      const match = cleanContent.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const result = JSON.parse(match[0]);
          if (result.expenses) return res.status(200).json(result);
        } catch (e2) {}
      }
      return res.status(500).json({ error: 'שגיאה בניתוח. נסה שוב.' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
