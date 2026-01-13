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

  const systemMessage = `You are an Israeli bank account (עו"ש) statement analyzer. You receive data from bank statements.

Your job is to categorize EVERY transaction into the correct expense category.

CRITICAL: Process ALL transactions. Do not skip any rows.

Return ONLY valid JSON in this exact format:
{"expenses": [{"description": "merchant/payee name", "amount": 123.45, "category": "category name"}]}

CATEGORIES FOR BANK ACCOUNT (עו"ש):
- שכר דירה (rent payments, שכירות, דמי שכירות)
- משכנתא (mortgage payments, תשלום משכנתא)
- חשמל (electricity - חברת החשמל, IEC)
- גז (gas - פזגז, סופרגז, אמישראגז)
- מים (water - תאגיד מים, מקורות, הגיחון)
- ארנונה (municipal tax - עיריית, מועצה)
- ועד בית (building committee, ניהול בניין)
- הלוואות (loan repayments, החזר הלוואה)
- ביטוח לאומי (national insurance)
- מס הכנסה (income tax, נציבות מס)
- מזומן ללא מעקב (ATM withdrawals, משיכת מזומן, כספומט)
- העברות בנקאיות (bank transfers without clear purpose)
- חיסכון (savings transfers, הפקדה לחיסכון)
- שונות (anything that doesn't fit above)

IMPORTANT RULES:
- Process EVERY transaction row
- Look for the payee/description and amount
- Ignore balance lines, summary lines, and account information
- For ATM withdrawals, use "מזומן ללא מעקב"
- For unclear transfers, use "העברות בנקאיות"`;

  const userPrompt = `Analyze this Israeli bank statement (עו"ש) from ${bankName || 'the bank'}.

Extract ALL transactions and categorize them.

DATA:
${cleanText}

Return JSON with all expenses categorized.`;

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

    // Clean and parse the response
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
      
      // Filter out non-transactions
      result.expenses = result.expenses.filter(exp => {
        if (!exp.description || !exp.amount) return false;
        if (typeof exp.amount !== 'number' || exp.amount <= 0) return false;
        
        const desc = exp.description.toLowerCase();
        const badPhrases = ['יתרה', 'סה"כ', 'balance', 'total'];
        return !badPhrases.some(phrase => desc.includes(phrase));
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
