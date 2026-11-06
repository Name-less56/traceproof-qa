import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCase, cleanRun, cleanStep, getMetrics, makeSeeds } from '../lib/domain.js';
import { generateSpec, slugify, outputFilename } from '../lib/generator.js';

const original = () => makeSeeds().cases[0];

test('seed cases include one reproducible failure and passing scenarios', () => {
  const state = makeSeeds();
  assert.equal(state.cases.length, 3);
  assert.equal(state.cases[0].steps.at(-1).action, 'assertText');
  assert.ok(state.cases.some(c => c.steps[0].value === '/sandbox/login'));
});
test('new cases normalize metadata and retain proper order', () => {
  const result = cleanCase({ title:'  New case  ',description:'',severity:'high',source:'QA',steps:[{action:'navigate',value:'/sandbox/shop'}] });
  assert.equal(result.title, 'New case'); assert.equal(result.severity,'high');
  assert.ok(result.id); assert.ok(result.createdAt);
});
test('case update keeps original stable case ID', () => {
  const item = original(); const modified = cleanCase({...item,title:'Renamed case'}, item);
  assert.equal(modified.id,item.id); assert.equal(modified.title,'Renamed case');
});
test('navigation is limited to bundled local sandbox', () => {
  assert.throws(()=>cleanStep({action:'navigate',value:'https://external.example'}),/sandbox routes/);
});
test('selectors reject arbitrary CSS and injection', () => {
  assert.throws(()=>cleanStep({action:'click',target:'button[onclick=evil()]'}),/Test ID/);
});
test('first step must be navigation', () => {
  assert.throws(()=>cleanCase({...original(),steps:[{action:'click',target:'buy'}]}),/First step/);
});
test('max 24 scenario steps', () => {
  assert.throws(()=>cleanCase({...original(),steps:Array.from({length:25},()=>({action:'navigate',value:'/sandbox/shop'}))}),/1–24/);
});
test('Playwright generator uses stable locator selectors and expected text', () => {
  const result=generateSpec(original());
  assert.match(result,/getByTestId\("add-to-cart"\)\.click/);
  assert.match(result,/toContainText\("Added to cart"\)/);
  assert.match(result,/page\.goto\("\/sandbox\/shop"\)/);
});
test('test titles are encoded safely as JS string literals',()=>{
  const result=generateSpec({...original(),title:'Failed "; process.exit() //'});
  assert.match(result,/test\("Failed \\\"; process\.exit\(\) \/\/"/);
});
test('slug output produces portable spec file names', () => {
  assert.equal(slugify('Lógica de QA & testing!'),'logica-de-qa-testing');
  assert.equal(outputFilename(original()),'cart-confirmation-is-missing.spec.ts');
});
test('run receipts enforce that outcome matches event failures', () => {
  assert.throws(()=>cleanRun({caseId:original().id,status:'passed',events:[{status:'failed',detail:'x'}]},[original()]),/does not match/);
});
test('run receipts preserve a legitimate failing evidence event',()=>{
  const record=cleanRun({caseId:original().id,status:'failed',durationMs:42,events:[{status:'passed',detail:'opened'},{status:'failed',detail:'missing element'}]},[original()]);
  assert.equal(record.status,'failed'); assert.equal(record.events.length,2); assert.equal(record.source,'local-browser-replay');
});
test('aggregated dashboard metrics reflect recorded runs',()=>{
  assert.deepEqual(getMetrics({cases:[original()],runs:[{status:'passed'},{status:'failed'},{status:'passed'}]}),{cases:1,runs:3,passing:2,failing:1,passRate:67});
});
