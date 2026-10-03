import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const guard = join(import.meta.dirname, 'feedback-e2e-network-guard.cjs');
test('test-only guard allows a loopback response but rejects its external redirect', () => {
  const source = `
    const assert=require('node:assert/strict');
    const http=require('node:http');
    const server=http.createServer((req,res)=>{
      if(req.url==='/redirect') res.writeHead(302,{location:'http://192.0.2.1:19000'}).end();
      else res.end('synthetic');
    });
    server.listen(19000,'127.0.0.1',async()=>{
      try {
        assert.equal(await (await fetch('http://127.0.0.1:19000')).text(),'synthetic');
        await assert.rejects(fetch('http://127.0.0.1:19000/redirect'));
        console.log('isolated');
      } catch(e) { process.exitCode=1; }
      finally { server.closeAllConnections(); server.close(); }
    });
  `;
  const output = execFileSync(process.execPath, ['--require', guard, '-e', source], {
    encoding: 'utf8',
    timeout: 10000,
    env: { SystemRoot: process.env.SystemRoot },
  });
  assert.equal(output.trim(), 'isolated');
});
for (const [name, expression] of [
  ['fetch HTTPS', "fetch('https://example.invalid')"],
  ['fetch remote IP', "fetch('http://192.0.2.1:19000')"],
  ['fetch wrong loopback port', "fetch('http://127.0.0.1:80')"],
  ['raw socket remote IP', "require('node:net').connect(443,'192.0.2.1')"],
  [
    'raw socket external hostname',
    "require('node:net').connect({port:443,host:'example.invalid'})",
  ],
  ['TLS', "require('node:tls').connect({port:443,host:'example.invalid'})"],
  ['DNS', "require('node:dns').lookup('example.invalid',()=>{})"],
]) {
  test(`test-only network guard refuses ${name} before communication`, () => {
    const output = execFileSync(
      process.execPath,
      [
        '--require',
        guard,
        '-e',
        `try { ${expression}; process.exit(2); } catch(e) { if(!e.message.startsWith('E2E ')) throw e; console.log('blocked'); }`,
      ],
      { encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot } },
    );
    assert.equal(output.trim(), 'blocked');
  });
}
