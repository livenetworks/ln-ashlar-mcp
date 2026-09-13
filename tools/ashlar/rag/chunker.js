export const tokenCount = ids => ids.size ?? ids.data?.length ?? ids.length;

export function generateChunks(index, tokenizer, RAG_CONFIG) {
  const chunks = [];
  
  for (const doc of index.docs.values()) {
    const { key, name, parsed } = doc;
    
    for (let i = 0; i < parsed.sections.length; i++) {
      const section = parsed.sections[i];
      const chunkIdPrefix = `${key}#${i.toString().padStart(4, '0')}`;
      let chunkIdx = 0;
      
      const lines = section.text.split('\n');
      let currentText = '';
      
      const flush = (text, prefix) => {
        if (!text.trim()) return;
        const cleanText = text.replace(/<[^>]+>/g, '').trim();
        if (!cleanText) return;
        
        const fullText = `${prefix}${cleanText}`;
        const tokens = tokenizer(fullText, { add_special_tokens: false }).input_ids;
        
        if (tokenCount(tokens) > RAG_CONFIG.MAX_TOKENS) {
          // Naive split if still too long (fallback)
          const words = cleanText.split(' ');
          if (words.length < 2) return;
          const half = Math.floor(words.length / 2);
          flush(words.slice(0, half).join(' '), prefix);
          flush(words.slice(half).join(' '), prefix);
          return;
        }
        
        chunks.push({
          chunkId: `${chunkIdPrefix}#${(chunkIdx++).toString().padStart(4, '0')}`,
          docKey: key,
          sectionIdx: i,
          text: fullText
        });
      };
      
      const prefix = `[${name}] ${section.title}: `;
      
      for (const line of lines) {
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          // It's a table row
          if (currentText) {
            flush(currentText, prefix);
            currentText = '';
          }
          if (!line.includes('---')) {
            flush(line, prefix);
          }
        } else {
          // Accumulate text until we hit token limit
          const testText = currentText ? `${currentText}\n${line}` : line;
          const tokens = tokenizer(`${prefix}${testText.replace(/<[^>]+>/g, '')}`, { add_special_tokens: false }).input_ids;
          
          if (tokenCount(tokens) > RAG_CONFIG.MAX_TOKENS) {
            flush(currentText, prefix);
            currentText = line;
          } else {
            currentText = testText;
          }
        }
      }
      
      if (currentText) {
        flush(currentText, prefix);
      }
    }
  }
  
  return chunks;
}
