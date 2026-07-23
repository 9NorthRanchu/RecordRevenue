const apiKey = 'AIzaSyB_k8e8dj1G_I45jwV26Nta4n9XQI1sjLU';
const models = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash'
];

async function testModels() {
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    console.log(`Testing ${model}...`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello' }] }]
        })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✅ ${model} works!`);
      } else {
        console.log(`❌ ${model} failed: ${data.error.code} - ${data.error.message}`);
      }
    } catch (e) {
      console.log(`❌ ${model} network error: ${e.message}`);
    }
  }
}
testModels();
