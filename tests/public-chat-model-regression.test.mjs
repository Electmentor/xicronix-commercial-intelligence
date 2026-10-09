import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler } from '../api/public-chat.mjs';
import { enforceOperations } from '../public-chat-operations.mjs';

// Actual synthetic QA responses, replayed through the real handler with no network.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/nexa-model-20261009.json', import.meta.url)));
const env = { GROQ_API_KEY: 'synthetic', PUBLIC_CHAT_BRIDGE_TOKEN: 'synthetic-regression' };
let id = 100;
for (const index of [2, 4, 9, 11]) {
 const f = fixtures[index];
 const handler = createHandler({ env, fetcher: async () => Response.json({ choices: [{ message: { content: JSON.stringify(f.response) } }] }) });
 const request = new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer synthetic-regression', 'x-chat-client': (++id).toString(16).padStart(64, '0') }, body: JSON.stringify({ messages: [{ role: 'user', content: f.user }] }) });
 const answer = await (await handler(request)).json();
 assert.equal(answer.provider, 'groq'); assert.equal(answer.degraded, false);
 assert.equal(answer.handoff, index !== 11); assert.deepEqual(answer.options, []);
 assert.doesNotMatch(answer.message, /incluye gu[ií]as|prepararemos|podemos enviarte|te enviaremos|m[oó]dulos interactivos/i);
 assert.match(answer.message, index === 11 ? /explorar/ : /solicitud|solicitar/i);
 if (index === 9) { assert.match(answer.message, /correo/); assert.doesNotMatch(answer.message, /horario|agendar|confirmar un horario/); }
}
const scientific = { message: 'Un circuito incluye una fuente, conductores y una carga.', handoff: false, options: [] };
assert.deepEqual(enforceOperations(scientific, [{ role: 'user', content: '¿Qué incluye un circuito sencillo?' }]), scientific);
const hypothetical = { message: 'Podemos crear un circuito que incluye una pila y un interruptor.', handoff: false, options: [] };
assert.deepEqual(enforceOperations(hypothetical, [{ role: 'user', content: '¿Cómo armo un circuito sencillo?' }]), hypothetical);
const schoolPractice = { message: 'En esta práctica prepararemos muestras de agua y recogeremos información sobre su conductividad.', handoff: false, options: [] };
assert.deepEqual(enforceOperations(schoolPractice, [{ role: 'user', content: 'Explícame una práctica escolar para comparar conductividad del agua.' }]), schoolPractice);
const negatedPromise = { message: 'No prepararemos una propuesta automáticamente: puedes solicitar que el equipo revise tu necesidad.', handoff: false, options: [] };
assert.deepEqual(enforceOperations(negatedPromise, [{ role: 'user', content: '¿La propuesta se hace automáticamente?' }]), negatedPromise);
const declinedEmail = enforceOperations(scientific, [{ role: 'user', content: 'No quiero llamadas; prefiero que no me contacten por correo.' }]);
assert.equal(declinedEmail.handoff, false); assert.equal(declinedEmail.message, scientific.message);
const exploring = fixtures[8];
assert.equal(enforceOperations(exploring.response, [{ role: 'user', content: exploring.user }]).message, exploring.response.message);
const sunday = enforceOperations({ message: 'Claro.', handoff: false, options: [] }, [{ role: 'user', content: 'Quiero una llamada el domingo.' }]);
assert.match(sunday.message, /domingos no atendemos/);
const complaint = enforceOperations({ message: 'Claro.', handoff: false, options: [] }, [{ role: 'user', content: 'Quiero registrar una queja.' }]);
assert.match(complaint.message, /Libro de Reclamaciones/);
const hours = enforceOperations({ message: 'Claro.', handoff: false, options: [] }, [{ role: 'user', content: '¿Cuál es el horario de atención?' }]);
assert.equal(hours.handoff, false); assert.match(hours.message, /lunes a sábado/);
console.log('PASS recorded model regressions: safe offer handoff, no duplicate CTA, email preference, no invented proposal action; informational answers, complaints and hours preserved. No real provider calls.');
