import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { accountService, CloseAccountError } from "@/modules/accounts/account.service";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;

  try {
    const cuenta = await accountService.getClosedResult(
      request.nextUrl.searchParams.get("atencionToken") ?? "",
      auth.session!.userId
    );
    if (!cuenta) return json({
      confirmado: false,
      mensaje: "No se encontró un cierre confirmado hasta este momento. Verificá nuevamente antes de tomar otra decisión."
    });
    return json({
      confirmado: true,
      cuenta: {
        id: cuenta.id,
        mesaId: cuenta.mesaId,
        mesaNumero: cuenta.mesa.numero,
        atencionToken: cuenta.atencionToken,
        fechaCierre: cuenta.fechaCierre.toISOString(),
        total: Number(cuenta.total),
        metodoPago: cuenta.metodoPago.nombre,
        estado: cuenta.estado.nombre
      }
    });
  } catch (error) {
    if (error instanceof CloseAccountError) return json({ error: error.message }, error.status);
    throw error;
  }
}
