// Simple chat functionality
export async function completion_(apiKey, apiUrl, modelName, messages, controller, onData) {
  console.log('[chat.js] completion_ called - stub implementation');
  
  try {
    if (!apiUrl || !apiKey) {
      throw new Error('API URL or API Key not configured');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            if (onData) {
              onData(parsed);
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error) {
    console.error('[chat.js] Error in completion_:', error);
    throw error;
  }
} 