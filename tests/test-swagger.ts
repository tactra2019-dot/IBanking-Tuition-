import assert from 'node:assert';
import { app as studentApp } from '../src/student-service';
import { app as paymentApp } from '../src/payment-service';

async function testSwagger() {
  const s1 = studentApp.listen(0);
  const port1 = (s1.address() as any).port;

  const res1 = await fetch(`http://localhost:${port1}/docs/`);
  assert.strictEqual(res1.status, 200);
  const text1 = await res1.text();
  assert.ok(text1.includes('swagger-ui'), 'Student docs should render Swagger UI');

  const res1Json = await fetch(`http://localhost:${port1}/docs.json`);
  assert.strictEqual(res1Json.status, 200);
  const json1: any = await res1Json.json();
  assert.strictEqual(json1.info.title, 'iBanking Tuition Payment Services (Student & Payment Microservices)');

  s1.close();

  const s2 = paymentApp.listen(0);
  const port2 = (s2.address() as any).port;
  const res2 = await fetch(`http://localhost:${port2}/docs/`);
  assert.strictEqual(res2.status, 200);
  s2.close();

  console.log('PASS: Swagger UI and OpenAPI JSON endpoints work on both services!');
}

testSwagger().catch((err) => {
  console.error(err);
  process.exit(1);
});

