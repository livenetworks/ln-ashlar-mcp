import { handler as searchHandler } from '../tools/generate_ln_search.js';
import { handler as popoverHandler } from '../tools/generate_ln_popover.js';

async function test() {
  const searchRes = await searchHandler({
    id: 'search-box-1',
    target_id: 'products-table',
    placeholder: 'Пребарај производи...'
  });
  console.log('=== SEARCH SNIPPET ===');
  console.log(searchRes.content[0].text);

  const cleanSearch = searchRes.content[0].text.replace(/```html\n|\n```/g, '');
  const popoverRes = await popoverHandler({
    id: 'filter-popover-1',
    content_html: cleanSearch
  });
  console.log('=== POPOVER WITH SEARCH ===');
  console.log(popoverRes.content[0].text);
}

test();
