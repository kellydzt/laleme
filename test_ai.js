
require('dotenv').config();

async function testConnection() {
    console.log("--- DEBUG START ---");
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        console.error("ERROR: GEMINI_API_KEY is undefined/empty!");
        return;
    }

    console.log("Raw Key Value:", JSON.stringify(key));
    console.log("Key Length:", key.length);

    // Check for whitespace
    if (key.trim() !== key) {
        console.error("WARNING: Key has surrounding whitespace!");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`; // Try trimming
    console.log("\nFetching URL with TRIMMED key...");

    try {
        const res = await fetch(url);
        console.log("Status:", res.status);
        if (res.ok) {
            console.log("SUCCESS! API works with trimmed key.");
            const json = await res.json();
            console.log("Models found:", json.models?.length);
            // List Flash models
            const flashes = json.models.filter(m => m.name.includes("flash") || m.name.includes("gemini-1.5"));
            console.log("Available Flash Models:", flashes.map(m => m.name));
        } else {
            console.log("FAILED body:", await res.text());
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }

    // TEST GENERATION
    console.log("\nTesting Generation (1.5-flash)...");
    const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key.trim()}`;
    try {
        const res = await fetch(genUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
        });
        console.log("Gen Status:", res.status);
        if (res.ok) {
            console.log("Gen Success!", await res.text());
        } else {
            console.log("Gen Failed:", await res.text());
        }
    } catch (e) { console.error("Gen Error", e); }
}

testConnection();
