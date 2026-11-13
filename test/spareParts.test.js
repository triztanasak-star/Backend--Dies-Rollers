const test = require('node:test');
const assert = require('node:assert/strict');
const makeRouter = require('../src/routes/spareParts.routes');

const payload = () => ({ system: 'System A', equipment: 'Bearing', specifications: '6205',
  stock_quantity: 2, in_use_quantity: 1, supplier: 'Supplier', price_vnd: 100,
  standard_ton: 1000, life_ton: 100, line_in_use: ['PL#1'], created_at: '2026-11-13T00:00:00Z',
  image_before: '', image_after: 'data:image/png;base64,YQ==', status: 'Trong kho', note: '',
  execution_plans: [{ id: 'plan-1', name: 'Replace bearing', tons: 25, due_date: '2026-11-14' }] });

function harness(method) {
  const queries = [];
  const router = makeRouter({ db: { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [{ id: 1 }] }; } },
    authMiddleware() {}, requireManagerOrAdmin() {}, logActivity: async () => {},
    handleServerError(_res, error) { throw error; } });
  const handler = router.stack.find(layer => layer.route?.methods[method]).route.stack.at(-1).handle;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  return { handler, queries, res };
}

test('create stores after image and JSON execution plans', async () => {
  const { handler, queries, res } = harness('post');
  const body = payload();
  await handler({ body }, res);
  assert.equal(res.code, 201);
  assert.match(queries[0].sql, /image_after,execution_plans/);
  assert.equal(queries[0].values.at(-2), body.image_after);
  assert.deepEqual(JSON.parse(queries[0].values.at(-1)), body.execution_plans);
});

test('legacy update preserves omitted plans and after image', async () => {
  const { handler, queries, res } = harness('put');
  const body = payload(); delete body.execution_plans; delete body.image_after;
  await handler({ body, params: { id: '1' } }, res);
  assert.equal(res.code, 200);
  assert.doesNotMatch(queries[0].sql, /execution_plans|image_after/);
  assert.equal(queries[0].values.at(-1), '1');
});

test('create and update accept FFS and CORN alongside existing lines', async () => {
  for (const method of ['post', 'put']) {
    const { handler, queries, res } = harness(method);
    await handler({ body: { ...payload(), line_in_use: ['PL#1', 'FFS', 'CORN'] }, params: { id: '1' } }, res);
    assert.equal(res.code, method === 'post' ? 201 : 200);
    assert.deepEqual(queries[0].values[9], ['PL#1', 'FFS', 'CORN']);
  }
});

test('list converts PostgreSQL numeric strings into JSON numbers', async () => {
  const router = makeRouter({ db: { query: async () => ({ rows: [{ id: 1, price_vnd: '20000000', standard_ton: '1000', life_ton: '500' }] }) },
    authMiddleware() {}, requireManagerOrAdmin() {}, logActivity: async () => {}, handleServerError(_res, error) { throw error; } });
  const handler = router.stack.find(layer => layer.route?.path === '/api/spare-parts' && layer.route.methods.get).route.stack.at(-1).handle;
  let result;
  await handler({}, { json(value) { result = value; } });
  assert.equal(result[0].price_vnd, 20000000);
  assert.equal(result[0].standard_ton, 1000);
  assert.equal(result[0].life_ton, 500);
});

test('QR public route is registered before auth and reads only the requested part', async () => {
  const calls = [];
  const authMiddleware = () => { throw new Error('Public access must not require login'); };
  const router = makeRouter({ db: { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [{ id: 7, equipment: 'Expander', price_vnd: '20000000', standard_ton: '1000', life_ton: '500', execution_plans: [] }] }; } },
    authMiddleware, requireManagerOrAdmin() {}, logActivity: async () => {}, handleServerError(_res, error) { throw error; } });
  assert.equal(router.stack[0].route.path, '/api/spare-parts/:id/public');
  const handler = router.stack[0].route.stack[0].handle;
  let response;
  await handler({ params: { id: '7' } }, { json(body) { response = body; } });
  assert.equal(response.id, 7);
  assert.equal(response.price_vnd, 20000000);
  assert.deepEqual(calls[0].values, ['7']);
  assert.match(calls[0].sql, /WHERE id=\$1/);
  assert.doesNotMatch(calls[0].sql, /SELECT \*/);
  let code;
  await handler({ params: { id: 'invalid' } }, { status(value) { code = value; return this; }, json() {} });
  assert.equal(code, 400);
  assert.equal(calls.length, 1);
});

test('invalid or duplicate plans and unsupported images are rejected without writes', async () => {
  for (const patch of [
    { execution_plans: [{ ...payload().execution_plans[0], tons: -1 }] },
    { execution_plans: [payload().execution_plans[0], payload().execution_plans[0]] },
    { execution_plans: [{ ...payload().execution_plans[0], name: ' ' }] },
    { image_after: 'javascript:alert(1)' },
  ]) {
    const { handler, queries, res } = harness('post');
    await handler({ body: { ...payload(), ...patch } }, res);
    assert.equal(res.code, 400);
    assert.equal(queries.length, 0);
  }
});
