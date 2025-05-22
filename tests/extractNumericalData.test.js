import assert from 'assert';
import Module from 'module';
import { test } from 'node:test';

// Mock dependencies required by dist/semanticSearch.js
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@prisma/client') {
    return { PrismaClient: class {} };
  }
  if (['openai', 'langchain/text_splitter', 'langchain/document', './geminiClient'].includes(request)) {
    return {};
  }
  return originalLoad.apply(this, arguments);
};

const { extractNumericalData } = await import('../dist/semanticSearch.js');

function buildResult(content, title = 'Doc') {
  return { content, documentTitle: title, metadata: {} };
}

test('extractNumericalData multiple matches context separation', () => {
  const gap = 'a'.repeat(150);
  const content = `Cost was £10.${gap}Later cost became £20.`;
  const results = extractNumericalData([buildResult(content)]);
  assert.equal(results.length, 2, 'should find two numbers');
  assert.ok(results[0].context.includes('£10'), 'context for first match');
  assert.ok(!results[0].context.includes('£20'), 'first context should not include second match');
  assert.ok(results[1].context.includes('£20'), 'context for second match');
});
