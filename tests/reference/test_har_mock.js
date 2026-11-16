'use strict';

var assert = require('assert');
var http = require('http');
var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var httpServer = require('../lib/http-server');

function makeRequest(port, options, reqBody) {
  return new Promise(function (resolve, reject) {
    var reqOpts = Object.assign({
      hostname: '127.0.0.1',
      port: port,
      method: 'GET'
    }, options);

    var req = http.request(reqOpts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var bodyBuffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: bodyBuffer,
          text: bodyBuffer.toString('utf8')
        });
      });
    });

    req.on('error', reject);
    if (reqBody) {
      req.write(reqBody);
    }
    req.end();
  });
}

async function run() {
  console.log('Testing CLI startup failure on missing/invalid HAR...');
  var binPath = path.resolve(__dirname, '../bin/http-server');

  var missingRes = cp.spawnSync(process.execPath, [binPath, '--har-mock', path.resolve(__dirname, 'fixtures/nonexistent.har')]);
  assert.strictEqual(missingRes.status, 1, 'Expected exit code 1 for missing HAR file');

  var malformedRes = cp.spawnSync(process.execPath, [binPath, '--har-mock', path.resolve(__dirname, 'fixtures/malformed.har')]);
  assert.strictEqual(malformedRes.status, 1, 'Expected exit code 1 for malformed HAR file');
  console.log('CLI startup failure checks passed.');

  console.log('Testing HAR Mock server request handling...');
  var fixturePath = path.resolve(__dirname, 'fixtures/mock.har');
  var harContent = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  var server = httpServer.createServer({
    harMock: harContent,
    root: path.resolve(__dirname, '../public')
  });

  await new Promise(function (resolve, reject) {
    server.listen(0, '127.0.0.1', resolve);
    server.server.on('error', reject);
  });

  var address = server.server.address();
  var port = address.port;

  try {
    // 1. Query parameter normalization: reordered & encoded
    console.log('Test 1: Reordered and percent-encoded query params');
    var res1 = await makeRequest(port, {
      path: '/api/search?tag=web+dev&sort=asc'
    });
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(JSON.parse(res1.text).result, 'query_ok');

    // 2. Case-insensitive Vary header routing
    console.log('Test 2: Case-insensitive Vary routing');
    var resVary1 = await makeRequest(port, {
      path: '/api/profile',
      headers: { 'x-client-type': 'Mobile' }
    });
    assert.strictEqual(resVary1.statusCode, 200);
    assert.strictEqual(JSON.parse(resVary1.text).view, 'mobile');

    var resVary2 = await makeRequest(port, {
      path: '/api/profile',
      headers: { 'X-CLIENT-TYPE': 'desktop' }
    });
    assert.strictEqual(resVary2.statusCode, 200);
    assert.strictEqual(JSON.parse(resVary2.text).view, 'desktop');

    // 3. Sequential stateful FIFO consumption
    console.log('Test 3: Sequential stateful FIFO consumption');
    var resPoll1 = await makeRequest(port, { path: '/api/poll' });
    assert.strictEqual(resPoll1.statusCode, 200);
    assert.strictEqual(JSON.parse(resPoll1.text).status, 'pending');

    var resPoll2 = await makeRequest(port, { path: '/api/poll' });
    assert.strictEqual(resPoll2.statusCode, 200);
    assert.strictEqual(JSON.parse(resPoll2.text).status, 'completed');

    var resPoll3 = await makeRequest(port, { path: '/api/poll' });
    assert.strictEqual(resPoll3.statusCode, 404);
    assert.strictEqual(JSON.parse(resPoll3.text).error, 'HAR_ENTRY_NOT_FOUND');

    // 4. Base64 decoded response body & Content-Length
    console.log('Test 4: Base64 body decoding');
    var resBin = await makeRequest(port, { path: '/api/binary' });
    assert.strictEqual(resBin.statusCode, 200);
    assert.strictEqual(resBin.text, 'Hello World');
    assert.strictEqual(resBin.headers['content-length'], '11');

    // 5. UTF-8 multi-byte Content-Length accuracy
    console.log('Test 5: Multi-byte UTF-8 body byte accuracy');
    var resUtf8 = await makeRequest(port, { path: '/api/utf8' });
    assert.strictEqual(resUtf8.statusCode, 200);
    assert.strictEqual(resUtf8.text, 'café 🚀');
    assert.strictEqual(resUtf8.headers['content-length'], '10');

    // 6. Unmatched request returns 404 with HAR_ENTRY_NOT_FOUND
    console.log('Test 6: Unmatched request 404');
    var res404 = await makeRequest(port, { path: '/api/unknown' });
    assert.strictEqual(res404.statusCode, 404);
    assert.strictEqual(JSON.parse(res404.text).error, 'HAR_ENTRY_NOT_FOUND');

    console.log('All HAR mock reference tests passed successfully!');
  } finally {
    server.close();
  }
}

run().catch(function (err) {
  console.error('Test failed:', err);
  process.exit(1);
});
