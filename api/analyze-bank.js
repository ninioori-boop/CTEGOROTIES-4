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
    return res.status(400).json({ error: 'No data provided' });
  }

  const API_KEY = process.env.OPENAI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const cleanText = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/"/g, "'")
    .substring(0, 60000);

  const systemMessage = `You are an Israeli bank account (עו"ש) statement analyzer.

CRITICAL: You must IGNORE the following - these are NOT expenses:
- Credit card company payments: מקס איט פיננסים, מקס, MAX, ישראכרט, ישראל כרט, כאל, לאומי קארד, דיינרס, אמריקן אקספרס
- Foreign currency transactions: קיזוז מטח, קיזוז מט"ח
- Interest and tax on interest: ריבית זכות, מס בגין ריבית, ריבית חובה
- Balance lines: יתרה, סה"כ
- Investment transactions: קניה/אלטשולר, מכירה/אלטשולר, קניה/מגדל, מכירה/מגדל
- Internal transfers to investments: העברה/אקסלנס

ONLY include REAL expenses that don't appear on credit cards:
- Rent: שכר דירה, דמי שכירות
- Mortgage: משכנתא, הלוואת דיור
- Electricity: חברת החשמל, IEC, חשמל
- Gas: פזגז, סופרגז, אמישראגז, גז
- Water: תאגיד מים, מי אביבים, הגיחון, מקורות
- Municipal tax: ארנונה, עיריית, מועצה
- Building committee: ועד בית, דמי ניהול
- Health insurance (HMO): מכבי, כללית, מאוחדת, לאומית (monthly fee)
- National insurance: ביטוח לאומי
- Loans: החזר הלוואה, הלוואה
- ATM withdrawals: משיכת מזומן, כספומט, ATM

Return ONLY valid JSON:
{"expenses": [{"description": "payee name", "amount": 123.45, "category": "category name"}]}

CATEGORIES:
- שכר דירה
- משכנתא
- חשמל
- גז
- מים
- ארנונה
- ועד בית
- קופת חולים (for מכבי, כללית etc monthly fees)
- ביטוח לאומי
- הלוואות
- מזומן ללא מעקב
- שונות`;

  const userPrompt = `Analyze this Israeli bank statement (עו"ש) from ${bankName || 'the bank'}.

IMPORTANT: 
- IGNORE all credit card payments (מקס איט פיננסים, ישראכרט, כאל, etc.) - these are just transfers to pay credit card bills!
- IGNORE all investment transactions (אלטשולר, מגדל, אקסלנס)
- IGNORE foreign currency transactions (קיזוז מטח)
- IGNORE interest (ריבית)
- ONLY include real recurring bills and expenses

DATA:
${cleanText}

Return JSON with ONLY real expenses (not credit card payments).`;

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
        max_tokens: 16000,
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

    let cleanContent = content
      .replace(/[\u0000-\u001F]+/g, ' ')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .trim();

    try {
      const result = JSON.parse(cleanContent);
      
      if (!result.expenses) {
        result.expenses = [];
      }
      
      // Additional filter to remove credit card payments and other non-expenses
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        
        const desc = exp.description.toLowerCase();
        
        // Filter out credit card company payments
        const creditCardCompanies = ['מקס', 'max', 'ישראכרט', 'ישראל כרט', 'כאל', 'לאומי קארד', 'דיינרס', 'אמריקן'];
        if (creditCardCompanies.some(cc => desc.includes(cc))) return false;
        
        // Filter out investment/trading transactions
        const investments = ['אלטשולר', 'מגדל', 'אקסלנס', 'קניה/', 'מכירה/'];
        if (investments.some(inv => desc.includes(inv))) return false;
        
        // Filter out foreign currency and interest
        const excluded = ['קיזוז מטח', 'ריבית', 'יתרה', 'סה"כ', 'balance', 'total'];
        if (excluded.some(ex => desc.includes(ex))) return false;
        
        return true;
      });
      
      return res.status(200).json(result);
    } catch (parseError) {
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
        details: parseError.message
      });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
