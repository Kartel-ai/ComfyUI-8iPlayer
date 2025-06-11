// Chat completion function for LLM APIs
export async function completion_(apiKey, apiUrl, modelName, messages, controller, onChunk) {
  if (!apiKey || !apiUrl || !modelName) {
    throw new Error('Missing required parameters: apiKey, apiUrl, or modelName');
  }

  const requestBody = {
    model: modelName,
    messages: messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller?.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
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
            if (onChunk && typeof onChunk === 'function') {
              onChunk(parsed);
            }
          } catch (e) {
            // Ignore malformed JSON
            console.warn('Failed to parse JSON chunk:', data);
          }
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Request was aborted');
    } else {
      console.error('Chat completion error:', error);
      throw error;
    }
  }
} 