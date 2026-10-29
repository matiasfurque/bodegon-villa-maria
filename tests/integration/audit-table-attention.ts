import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createSessionCookie } from "../../src/lib/auth";
import { POST } from "../../src/app/api/mesas/route";
import { PATCH, DELETE } from "../../src/app/api/mesas/[id]/route";
import { CODES } from "../../src/lib/normalized";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_attention_race_20261027" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_attention_race_20261027");
}

function request(method: string, path: string, body: object, cookie: string) {
  return new NextRequest(`http://127.0.0.1:55432${path}`, {
    method,
    headers: { cookie: `bvm_session=${cookie}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function main() {
  const db = new PrismaClient();
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, {
      username: "bvm_test", database: "bvm_attention_race_20261027", host: "127.0.0.1", port: 55432
    });
    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const admin = await db.user.findUniqueOrThrow({ where: { usuario: "admin" } });
    const employeeCookie = createSessionCookie(employee);
    const adminCookie = createSessionCookie(admin);
    const numero = 99500000 + randomInt(1, 100000);
    const createdResponse = await POST(request("POST", "/api/mesas", { numero, capacidad: 4, descripcion: "Auditoría mesa" }, employeeCookie));
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.revision, 0);
    assert.equal(created.atencionToken, null);
    const params = { params: Promise.resolve({ id: String(created.id) }) };
    const callPatch = (body: object, cookie = employeeCookie) => PATCH(request("PATCH", `/api/mesas/${created.id}`, body, cookie), params);
    const callDelete = (body: object) => DELETE(request("DELETE", `/api/mesas/${created.id}`, body, employeeCookie), params);
    const callPostExisting = (body: object) => POST(request("POST", "/api/mesas", {
      numero, capacidad: 4, ...body
    }, employeeCookie));

    const openAResponse = await callPatch({ estado: "Ocupada", revisionEsperada: 0, atencionTokenEsperado: null });
    assert.equal(openAResponse.status, 200);
    const openA = await openAResponse.json();
    assert.ok(openA.atencionToken);
    assert.equal(openA.revision, 1);

    const repeatedOpen = await callPatch({ estado: "Ocupada", revisionEsperada: 1, atencionTokenEsperado: openA.atencionToken });
    assert.equal(repeatedOpen.status, 200);
    assert.equal((await repeatedOpen.json()).revision, 1);
    const repeatedPost = await callPostExisting({ descripcion: "Auditoría mesa", revisionEsperada: 1, atencionTokenEsperado: openA.atencionToken });
    assert.equal(repeatedPost.status, 200);
    assert.equal((await repeatedPost.json()).revision, 1);

    assert.equal((await callPostExisting({ descripcion: "No autorizado", revisionEsperada: 1 })).status, 409);
    assert.equal((await callPatch({ descripcion: "No autorizado", revisionEsperada: 1 })).status, 409);
    const changedPost = await callPostExisting({ descripcion: "Cambio A", revisionEsperada: 1, atencionTokenEsperado: openA.atencionToken });
    assert.equal(changedPost.status, 200);
    const changedA = await changedPost.json();
    assert.equal(changedA.atencionToken, openA.atencionToken);
    assert.equal(changedA.revision, 2);

    assert.equal((await callPatch({ estado: "Libre", revisionEsperada: 1, atencionTokenEsperado: openA.atencionToken })).status, 409);
    const releasedResponse = await callPatch({ estado: "Libre", revisionEsperada: 2, atencionTokenEsperado: openA.atencionToken });
    assert.equal(releasedResponse.status, 200);
    const released = await releasedResponse.json();
    assert.equal(released.revision, 3);
    assert.equal(released.atencionToken, null);
    const openBResponse = await callPatch({ estado: "Ocupada", revisionEsperada: 3, atencionTokenEsperado: null });
    assert.equal(openBResponse.status, 200);
    const openB = await openBResponse.json();
    assert.ok(openB.atencionToken && openB.atencionToken !== openA.atencionToken);
    assert.equal(openB.revision, 4);

    const stale = { revisionEsperada: 2, atencionTokenEsperado: openA.atencionToken };
    assert.equal((await callPostExisting({ descripcion: "Viejo", ...stale })).status, 409);
    assert.equal((await callPatch({ estado: "Libre", ...stale })).status, 409);
    assert.equal((await callDelete(stale)).status, 409);
    assert.equal((await callPatch({ estado: "Libre", revisionEsperada: 4 })).status, 409);
    let mesa = await db.mesa.findUniqueOrThrow({ where: { id: created.id }, include: { estado: true } });
    assert.equal(mesa.atencionToken, openB.atencionToken);
    assert.equal(mesa.revision, 4);
    assert.equal(mesa.estado.codigo, CODES.mesa.ocupada);

    const expectedB = { revisionEsperada: 4, atencionTokenEsperado: openB.atencionToken };
    const competing = await Promise.all([
      callPatch({ descripcion: "Empleado", ...expectedB }, employeeCookie),
      callPatch({ descripcion: "Administrador", ...expectedB }, adminCookie)
    ]);
    assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
    mesa = await db.mesa.findUniqueOrThrow({ where: { id: created.id }, include: { estado: true } });
    assert.equal(mesa.revision, 5);
    assert.equal(mesa.atencionToken, openB.atencionToken);
    assert.equal(mesa.estado.codigo, CODES.mesa.ocupada);

    const evidence = { target: identity, mesaId: created.id, tokensDistinct: openA.atencionToken !== openB.atencionToken,
      revisionFinal: mesa.revision,
      checks: ["post-mesa-nueva", "abrir-a", "reapertura-idempotente", "post-existente-idempotente",
        "token-omitido-en-mesa-ocupada", "post-existente-metadata-revision", "release-revision-vieja",
        "release-a", "reabrir-b", "post-patch-delete-viejos-rechazados", "dos-usuarios-una-sola-revision"],
      result: "APROBADA" };
    await writeFile("tests/evidence/audit-table-attention-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
