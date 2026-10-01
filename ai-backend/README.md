# GHL OpenRouter Voice Agent Backend

Separate backend for a GoHighLevel voice + text AI widget.

- Runtime: Node.js
- Endpoint: POST /api/chat
- Model: openai/gpt-4o via OpenRouter
- Secret: OPENROUTER_API_KEY stored only in Render environment variables
- Health: GET /health

This branch is deployed as a separate Render web service and is not part of the live weather website.
