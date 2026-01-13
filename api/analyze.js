module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 20000);

  const systemMessage = `Israeli credit card analyzer. Return JSON: {"expenses":[{"description":"name","amount":123,"category":"cat"}]}

CATEGORIES:
מזון לבית, אוכל בחוץ ובילויים, תחביבים, תקשורת, ביטוח, בריאות, דלק וחניה, תחבצ, ביגוד והנעלה, פארם, תספורת וקוסמטיקה, מתנות, כבישי אגרה, חופשה וטיול, תיקוני רכב, בעלי חיים, ביט ללא מעקב, מזומן ללא מעקב, מיסים, דמי ניהול בניין, עמלות בנק ואשראי, שונות

INSTALLMENT RULES (CRITICAL):
- "amount" = the MONTHLY payment amount (NOT the total!)
- If you see "תשלום X/Y" or "X מ-Y" = installment X of Y
- Add: "installment_current": X, "installment_total": Y, "total_amount": full price
- Example: "מכבידנט 1116 תשלום 11/12 סה"כ 13403" → amount: 1116, installment_current: 11, installment_total: 12, total_amount: 13403

OTHER RULES:
- BIT/ביט = "ביט ללא מעקב"
- מיי טאוור = "דמי ניהול בניין"
- מס הכנסה/מע"מ = "מיסים"
- IGNORE: מסגרת אשראי, יתרה, סה"כ לחיוב`;

  const userPrompt = `Credit card data. Categorize ALL transactions:\n${cleanText}`;

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
        max_tokens: 8000,
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
      
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        const desc = exp.description.toLowerCase();
        return !['מסגרת אשראי', 'יתרת זכות', 'סה"כ'].some(p => desc.includes(p));
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
