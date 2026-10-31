"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChefHat, ChevronDown, Edit3, KeyRound, LogOut, Minus, Plus, Receipt, RefreshCcw, Save, Search, Table2, Trash2 } from "lucide-react";
import { money } from "@/lib/money";
import { readPendingAccountClose, savePendingAccountClose } from "@/modules/accounts/account-pending";
import type { PendingAccountClose } from "@/modules/accounts/account-pending";
import { readPendingOrderDraft, savePendingOrderDraft } from "@/modules/orders/order-draft";
import type { OrderAttention, OrderDraftItem, PendingOrderCreation } from "@/modules/orders/order-draft";

type Role = { id: number; nombre: string };
type PermissionCode = "inicio.ver" | "operaciones.gestionar" | "cocina.gestionar" | "productos.gestionar" | "usuarios.gestionar" | "reportes.ver" | "historial.ver";
type RolePermission = { permiso: { codigo: PermissionCode | string; nombre: string } };
type AuthUser = { id: number; nombre: string; apellido: string; usuario: string; email?: string | null; role: { nombre: string; permisos: RolePermission[] } };
type User = { id: number; nombre: string; apellido: string; usuario: string; email?: string | null; telefono?: string | null; estado: boolean; roleId?: number; role: Role };
type Mesa = { id: number; numero: number; descripcion?: string | null; capacidad: number; estado: string; estadoCodigo?: string; estadoPermitePedido?: boolean; estadoLiberaMesa?: boolean; activa: boolean; revision: number; atencionToken: string | null };
type Categoria = { id: number; nombre: string; orden?: number | null; visible: boolean };
type Producto = { id: number; nombre: string; descripcion?: string | null; precio: string; activo: boolean; visibleMenu: boolean; categoriaId: number; categoria: Categoria };
type PedidoItem = { id: number; productoId: number; cantidad: number; precioUnitario: string; subtotal: string; observacion?: string | null; anulado: boolean; motivoAnulacion?: string | null; producto: Producto };
type Pedido = { id: number; mesaId: number; atencionToken: string | null; revisionContenido: number; estado: string; estadoCodigo?: string; estadoActivo?: boolean; estadoCocina: string; estadoCocinaCodigo?: string; estadoCocinaPermiteAgregarItems?: boolean; estadoCocinaVisible?: boolean; estadoCocinaNotificaMozo?: boolean; observacion?: string | null; fechaHora: string; mesa?: Mesa; usuario?: { nombre: string; apellido: string; usuario: string }; items: PedidoItem[] };

function belongsToCurrentAttention(pedido: Pedido, mesa: Mesa | null | undefined) {
  return Boolean(mesa?.atencionToken && pedido.atencionToken === mesa.atencionToken);
}
type PaymentMethod = string;
type Cuenta = { id: number; atencionToken?: string | null; fechaCierre: string; total: string; metodoPago: PaymentMethod; metodoPagoCodigo?: string; metodoPagoRequiereMontoRecibido?: boolean; montoRecibido: string; vuelto: string; detalleJson: string; mesa: Mesa; usuarioCierre: { nombre: string; apellido: string; usuario: string } };
type CuentaDetalleItem = { id: number; pedidoId: number; producto: string; cantidad: number; precioUnitario: number; subtotal: number; observacion?: string | null };
type Report = { from: string; to: string; totalDia: number; totalPeriodo: number; cuentasHoy: number; cuentasPeriodo: number; mesasOcupadas: number; mesasAtendidasHoy: number; mesasAtendidasPeriodo: number; pedidosAnulados: number; cobrosPorMetodo: Array<{ metodo: string; cantidad: number; total: number }>; productosMasVendidos: Array<{ producto: string; cantidad: number; total: number }> };
type ConfirmAction = { title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> };
type SelectOption = { value: string | number; label: string };
type MetodoPago = { id: number; codigo: string; nombre: string; requiereMontoRecibido: boolean };
type CocinaEstado = { id: number; codigo: string; nombre: string; orden: number; permiteAgregarItems: boolean; visibleCocina: boolean; notificaMozo: boolean };
type Catalogs = { metodosPago: MetodoPago[]; cocinaEstados: CocinaEstado[] };

const tabs: Array<{ label: string; permiso: PermissionCode }> = [
  { label: "Inicio", permiso: "inicio.ver" },
  { label: "Operaciones", permiso: "operaciones.gestionar" },
  { label: "Cocina", permiso: "cocina.gestionar" },
  { label: "Productos", permiso: "productos.gestionar" },
  { label: "Usuarios", permiso: "usuarios.gestionar" },
  { label: "Reportes", permiso: "reportes.ver" },
  { label: "Historial", permiso: "historial.ver" }
];
const emptyCatalogs: Catalogs = { metodosPago: [], cocinaEstados: [] };
const OPERATIONAL_REFRESH_MS = 7000;
const OPERATIONAL_REFRESH_DEDUPE_MS = 2000;

class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    cache: (options?.method || "GET").toUpperCase() === "GET" ? "no-store" : options?.cache,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || "Operacion rechazada", response.status);
  return data;
}

export default function DashboardClient({ user }: { user: AuthUser }) {
  const router = useRouter();
  const permissionSet = useMemo(
    () => new Set(user.role.permisos.map((item) => item.permiso.codigo)),
    [user.role.permisos]
  );
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => permissionSet.has(tab.permiso)).map((tab) => tab.label),
    [permissionSet]
  );
  const canViewInicio = permissionSet.has("inicio.ver");
  const canManageOperaciones = permissionSet.has("operaciones.gestionar");
  const canManageCocina = permissionSet.has("cocina.gestionar");
  const canManageProducts = permissionSet.has("productos.gestionar");
  const canManageUsers = permissionSet.has("usuarios.gestionar");
  const canViewReports = permissionSet.has("reportes.ver");
  const canViewHistory = permissionSet.has("historial.ver");
  const [active, setActive] = useState(visibleTabs[0] || "Operaciones");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs>(emptyCatalogs);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [allPedidos, setAllPedidos] = useState<Pedido[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [selectedMesaId, setSelectedMesaId] = useState<number | null>(null);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedCuenta, setSelectedCuenta] = useState<Cuenta | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("todas");
  const [productStatusFilter, setProductStatusFilter] = useState("todos");
  const [productVisibilityFilter, setProductVisibilityFilter] = useState("todos");
  const [productSort, setProductSort] = useState("nombre");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("todos");
  const [userStatusFilter, setUserStatusFilter] = useState("todos");
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState("Activas");
  const [historyMesaId, setHistoryMesaId] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [closeAttention, setCloseAttention] = useState<Omit<PendingAccountClose, "payment"> | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingAccountClose | null>(null);
  const [verifyingClose, setVerifyingClose] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [closeConflict, setCloseConflict] = useState(false);
  const [closingAccount, setClosingAccount] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingReport, setRefreshingReport] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewedKitchenRevisions, setReviewedKitchenRevisions] = useState<Record<number, number>>({});
  const activeRef = useRef(active);
  const selectedMesaIdRef = useRef(selectedMesaId);
  const autoRefreshRunningRef = useRef(false);
  const actionRunningRef = useRef(false);
  const modalOpenRef = useRef(false);
  const lastOperationalRefreshRef = useRef(0);
  const localMutationVersionRef = useRef(0);
  const selectedMesa = mesas.find((mesa) => mesa.id === selectedMesaId) || mesas[0] || null;
  const nextMesaNumber = useMemo(
    () => Math.max(0, ...mesas.map((mesa) => mesa.numero)) + 1,
    [mesas]
  );
  const pedidosEnCurso = useMemo(
    () => pedidos.filter((pedido) => belongsToCurrentAttention(pedido, selectedMesa) &&
      (pedido.estadoActivo ?? pedido.estado === "Activo")),
    [pedidos, selectedMesa]
  );
  const hayConsumosVigentes = pedidosEnCurso.some((pedido) => pedido.items.some((item) => !item.anulado));
  const consumoTotal = useMemo(
    () =>
      pedidosEnCurso
        .flatMap((pedido) => pedido.items.filter((item) => !item.anulado))
        .reduce((sum, item) => sum + Number(item.subtotal), 0),
    [pedidosEnCurso]
  );
  const cuentaDetalle = useMemo<CuentaDetalleItem[]>(
    () =>
      pedidosEnCurso.flatMap((pedido) =>
        pedido.items
          .filter((item) => !item.anulado)
          .map((item) => ({
            id: item.id,
            pedidoId: pedido.id,
            producto: item.producto.nombre,
            cantidad: item.cantidad,
            precioUnitario: Number(item.precioUnitario),
            subtotal: Number(item.subtotal),
            observacion: item.observacion
          }))
      ),
    [pedidosEnCurso]
  );
  const pedidosPendientesDeEntrega = useMemo(
    () => pedidosEnCurso.filter((pedido) => pedido.estadoCocinaVisible ?? pedido.estadoCocina !== "Entregado"),
    [pedidosEnCurso]
  );
  const productStats = useMemo(
    () => ({
      total: productos.length,
      activos: productos.filter((producto) => producto.activo).length,
      visibles: productos.filter((producto) => producto.visibleMenu).length,
      categorias: categorias.length
    }),
    [categorias.length, productos]
  );
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return productos
      .filter((producto) => {
        const matchesText = !term || `${producto.nombre} ${producto.descripcion || ""}`.toLowerCase().includes(term);
        const matchesCategory = productCategoryFilter === "todas" || producto.categoriaId === Number(productCategoryFilter);
        const matchesStatus = productStatusFilter === "todos" || (productStatusFilter === "activos" ? producto.activo : !producto.activo);
        const matchesVisibility = productVisibilityFilter === "todos" || (productVisibilityFilter === "visibles" ? producto.visibleMenu : !producto.visibleMenu);
        return matchesText && matchesCategory && matchesStatus && matchesVisibility;
      })
      .sort((a, b) => {
        if (productSort === "categoria") return a.categoria.nombre.localeCompare(b.categoria.nombre) || a.nombre.localeCompare(b.nombre);
        if (productSort === "precio") return Number(a.precio) - Number(b.precio);
        if (productSort === "estado") return Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre);
        return a.nombre.localeCompare(b.nombre);
      });
  }, [productCategoryFilter, productSearch, productSort, productStatusFilter, productVisibilityFilter, productos]);
  const userStats = useMemo(
    () => ({
      total: users.length,
      activos: users.filter((item) => item.estado).length,
      inactivos: users.filter((item) => !item.estado).length,
      rolesAsignados: new Set(users.map((item) => item.role.id)).size
    }),
    [users]
  );
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return users.filter((item) => {
      const matchesText = !term || `${item.nombre} ${item.apellido} ${item.usuario} ${item.email || ""}`.toLowerCase().includes(term);
      const matchesRole = userRoleFilter === "todos" || item.role.id === Number(userRoleFilter);
      const matchesStatus = userStatusFilter === "todos" || (userStatusFilter === "activos" ? item.estado : !item.estado);
      return matchesText && matchesRole && matchesStatus;
    });
  }, [userRoleFilter, userSearch, userStatusFilter, users]);
  const activePedidosResumen = useMemo(() => {
    const activePedidos = allPedidos.filter((pedido) => belongsToCurrentAttention(pedido,
      mesas.find((mesa) => mesa.id === pedido.mesaId)) && (pedido.estadoActivo ?? pedido.estado === "Activo"));
    const byMesa = new Map<number, { mesa: Mesa | null; pedidos: number; items: number; total: number; listos: number }>();

    for (const pedido of activePedidos) {
      const current = byMesa.get(pedido.mesaId) || {
        mesa: mesas.find((mesa) => mesa.id === pedido.mesaId) || null,
        pedidos: 0,
        items: 0,
        total: 0,
        listos: 0
      };
      current.pedidos += 1;
      if (pedido.estadoCocinaNotificaMozo ?? pedido.estadoCocina === "Listo") current.listos += 1;
      for (const item of pedido.items.filter((pedidoItem) => !pedidoItem.anulado)) {
        current.items += item.cantidad;
        current.total += Number(item.subtotal);
      }
      byMesa.set(pedido.mesaId, current);
    }

    return Array.from(byMesa.values()).sort((a, b) => (a.mesa?.numero || 0) - (b.mesa?.numero || 0));
  }, [allPedidos, mesas]);
  const activePedidosByMesa = useMemo(
    () => new Map(activePedidosResumen.map((item) => [item.mesa?.id || 0, item])),
    [activePedidosResumen]
  );
  const kitchenOrders = useMemo(() => {
    const activeOrders = allPedidos
      .filter((pedido) => belongsToCurrentAttention(pedido, mesas.find((mesa) => mesa.id === pedido.mesaId)))
      .filter((pedido) => pedido.estadoActivo ?? pedido.estado === "Activo")
      .filter((pedido) => pedido.items.some((item) => !item.anulado));
    const visibleOrders = kitchenStatusFilter === "Activas"
      ? activeOrders.filter((pedido) => pedido.estadoCocinaVisible ?? pedido.estadoCocina !== "Entregado")
      : activeOrders.filter((pedido) => pedido.estadoCocina === kitchenStatusFilter);

    return visibleOrders.sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime());
  }, [allPedidos, kitchenStatusFilter, mesas]);
  const dashboardStats = useMemo(() => {
    const mesasActivas = mesas.filter((mesa) => mesa.activa);
    const mesasOcupadas = mesasActivas.filter((mesa) => mesa.estadoPermitePedido ?? mesa.estado === "Ocupada").length;
    const consumoAbierto = activePedidosResumen.reduce((sum, mesa) => sum + mesa.total, 0);
    const ultimaCuenta = cuentas[0] || null;
    return {
      mesasOcupadas,
      mesasLibres: mesasActivas.filter((mesa) => mesa.estadoLiberaMesa ?? mesa.estado === "Libre").length,
      consumoAbierto,
      cuentasAbiertas: activePedidosResumen.length,
      ventasHoy: report?.totalPeriodo || 0,
      cuentasHoy: report?.cuentasPeriodo || 0,
      ticketPromedio: report?.cuentasPeriodo ? (report.totalPeriodo / report.cuentasPeriodo) : 0,
      ultimaCuenta
    };
  }, [activePedidosResumen, cuentas, mesas, report]);

  async function loadCuentas() {
    const params = new URLSearchParams();
    if (historyMesaId) params.set("mesaId", historyMesaId);
    if (historyFrom) params.set("from", historyFrom);
    if (historyTo) params.set("to", historyTo);
    setCuentas(await api(`/api/cuentas${params.toString() ? `?${params}` : ""}`));
  }

  async function loadReport(fromOverride = reportFrom, toOverride = reportTo) {
    const params = new URLSearchParams();
    if (fromOverride) params.set("from", fromOverride);
    if (toOverride) params.set("to", toOverride);
    setReport(await api(`/api/reports${params.toString() ? `?${params}` : ""}`));
  }

  async function refreshReport(fromOverride = reportFrom, toOverride = reportTo) {
    try {
      setRefreshingReport(true);
      setMessage("");
      await loadReport(fromOverride, toOverride);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el reporte");
    } finally {
      setRefreshingReport(false);
    }
  }

  async function applyReportPreset(preset: "today" | "week" | "month") {
    const today = new Date();
    const from = new Date(today);
    if (preset === "week") from.setDate(today.getDate() - 6);
    if (preset === "month") from.setDate(1);
    const fromText = toDateInput(from);
    const toText = toDateInput(today);
    setReportFrom(fromText);
    setReportTo(toText);
    await refreshReport(fromText, toText);
  }

  function applyOperationalData(mesasData: Mesa[], allPedidosData: Pedido[]) {
    setMesas(mesasData);
    setAllPedidos(allPedidosData);
    const currentMesaId = selectedMesaIdRef.current;
    const nextMesaId = currentMesaId && mesasData.some((mesa) => mesa.id === currentMesaId)
      ? currentMesaId
      : mesasData[0]?.id || null;
    if (nextMesaId !== currentMesaId) {
      selectedMesaIdRef.current = nextMesaId;
      setSelectedMesaId(nextMesaId);
    }
    setPedidos(nextMesaId ? allPedidosData.filter((pedido) => pedido.mesaId === nextMesaId) : []);
    lastOperationalRefreshRef.current = Date.now();
  }

  async function loadAll() {
    const version = localMutationVersionRef.current;
    const operationalData = Promise.all([
      api("/api/mesas"),
      api("/api/pedidos")
    ]).then(([mesasData, allPedidosData]) => {
      if (version === localMutationVersionRef.current) applyOperationalData(mesasData, allPedidosData);
    });
    const [, categoriasData, productosData, catalogsData] = await Promise.all([
      operationalData,
      api("/api/categories"),
      api("/api/products"),
      api("/api/catalogs")
    ]);
    setCategorias(categoriasData);
    setProductos(productosData);
    setCatalogs(catalogsData);
    if (canManageUsers) {
      const [rolesData, usersData] = await Promise.all([
        api("/api/roles"),
        api("/api/users")
      ]);
      setRoles(rolesData);
      setUsers(usersData);
    }
    if (canViewReports) {
      setReport(await api("/api/reports"));
    }
    if (canViewHistory) {
      await loadCuentas();
    }
  }

  async function loadOperationalData() {
    const version = localMutationVersionRef.current;
    const [mesasData, allPedidosData] = await Promise.all([
      api("/api/mesas"),
      api("/api/pedidos")
    ]);
    if (version === localMutationVersionRef.current) applyOperationalData(mesasData, allPedidosData);
  }

  async function refreshAll() {
    try {
      actionRunningRef.current = true;
      setRefreshing(true);
      setMessage("");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      setRefreshing(false);
      actionRunningRef.current = false;
    }
  }

  useEffect(() => {
    loadAll().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    setReviewedKitchenRevisions((current) => {
      let changed = false;
      const next = { ...current };
      for (const pedido of allPedidos) {
        if (next[pedido.id] === undefined) {
          next[pedido.id] = pedido.revisionContenido;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [allPedidos]);

  useEffect(() => {
    if (!canManageOperaciones) return;
    try {
      const restored = readPendingAccountClose(window.sessionStorage.getItem(`bvm-pending-account-close:${user.id}`));
      if (restored) {
        setPendingClose(restored);
        setCloseAttention(restored);
        setCloseError("El resultado del cobro sigue sin confirmar. Verificá antes de realizar otro cierre.");
      }
    } catch {
      setMessage("No se pudo leer el cobro pendiente de esta pestaña. Revisá el almacenamiento del navegador.");
    }
  }, [canManageOperaciones, user.id]);

  useEffect(() => {
    const previous = activeRef.current;
    activeRef.current = active;
    if (previous !== active && ["Operaciones", "Cocina"].includes(active)) {
      void refreshOperationalData();
    }
  }, [active]);

  useEffect(() => {
    selectedMesaIdRef.current = selectedMesaId;
  }, [selectedMesaId]);

  useEffect(() => {
    modalOpenRef.current = Boolean(closeAttention || showSecurity || confirmAction);
  }, [confirmAction, closeAttention, showSecurity]);

  async function refreshOperationalData() {
    if (!["Operaciones", "Cocina"].includes(activeRef.current)) return;
    if (document.visibilityState !== "visible") return;
    if (autoRefreshRunningRef.current) return;
    if (actionRunningRef.current || modalOpenRef.current) return;
    if (Date.now() - lastOperationalRefreshRef.current < OPERATIONAL_REFRESH_DEDUPE_MS) return;

    try {
      autoRefreshRunningRef.current = true;
      await loadOperationalData();
    } catch {
      // El boton Actualizar muestra errores visibles; el refresco automatico evita interrumpir el trabajo.
    } finally {
      autoRefreshRunningRef.current = false;
    }
  }

  useEffect(() => {
    const interval = window.setInterval(refreshOperationalData, OPERATIONAL_REFRESH_MS);
    const refreshWhenVisible = () => { void refreshOperationalData(); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!visibleTabs.includes(active)) {
      setActive(visibleTabs[0]);
    }
  }, [active, visibleTabs]);

  async function run<T>(action: () => Promise<T>, ok = "Operacion realizada"): Promise<{ ok: true; value: T } | { ok: false }> {
    try {
      actionRunningRef.current = true;
      localMutationVersionRef.current += 1;
      setMessage("");
      const value = await action();
      try {
        await (["Operaciones", "Cocina"].includes(activeRef.current) ? loadOperationalData() : loadAll());
        setMessage(ok);
      } catch {
        setMessage(`${ok}. No se pudo actualizar la vista; presioná Actualizar.`);
      }
      return { ok: true, value };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
      return { ok: false };
    } finally {
      actionRunningRef.current = false;
    }
  }

  async function selectMesa(id: number) {
    selectedMesaIdRef.current = id;
    setSelectedMesaId(id);
    setPedidos(await api(`/api/pedidos?mesaId=${id}`));
  }

  async function addProductToMesa(body: Record<string, unknown>, observed: OrderAttention,
    onOccupied: (attention: OrderAttention) => void, onItemAdded: (draftId: string) => void,
    onItemSending: (draftId: string, pedidoId: number) => void,
    onCreating: (creation: PendingOrderCreation) => void,
    onCreationConflict: () => void) {
    if (!selectedMesa || selectedMesa.id !== observed.mesaId) throw new Error("Selecciona la mesa del borrador");
    const items = Array.isArray(body.items) ? body.items : [];
    const pendingCreation = body.pendingCreation as PendingOrderCreation | null;
    if (pendingCreation) {
      try {
        await api("/api/pedidos", { method: "POST", body: JSON.stringify(pendingCreation) });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) onCreationConflict();
        throw error;
      }
      return;
    }
    if (items.length === 0 || items.some((item) => !(item as { productoId?: unknown }).productoId)) {
      throw new Error("Selecciona al menos un producto");
    }

    let atencionToken = observed.atencionToken;
    if (!observed.occupied) {
      const occupiedMesa: Mesa = await api(`/api/mesas/${observed.mesaId}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "Ocupada", revisionEsperada: observed.revision, atencionTokenEsperado: observed.atencionToken })
      });
      atencionToken = occupiedMesa.atencionToken;
      setMesas((current) => current.map((mesa) => mesa.id === occupiedMesa.id ? occupiedMesa : mesa));
      onOccupied({ mesaId: observed.mesaId, revision: occupiedMesa.revision, atencionToken, occupied: true });
    }
    if (!atencionToken) throw new Error("Esta mesa no tiene una atención identificada. Actualizá los datos.");

    const activePedido = pedidos.find((pedido) => pedido.atencionToken === atencionToken &&
      (pedido.estadoActivo ?? pedido.estado === "Activo") &&
      (pedido.estadoCocinaPermiteAgregarItems ?? ["Pendiente", "En preparacion"].includes(pedido.estadoCocina)));
    for (const item of items) {
      const draftItem = item as Record<string, unknown>;
      const targetPedidoId = typeof draftItem.targetPedidoId === "number" ? draftItem.targetPedidoId : activePedido?.id;
      if (targetPedidoId) {
        const { draftId } = draftItem;
        if (typeof draftId === "string") onItemSending(draftId, targetPedidoId);
        await api(`/api/pedidos/${targetPedidoId}/items`, {
          method: "POST",
          body: JSON.stringify({ productoId: draftItem.productoId, cantidad: draftItem.cantidad,
            observacion: draftItem.observacion, solicitudId: draftItem.solicitudId, atencionToken })
        });
        if (typeof draftId === "string") onItemAdded(draftId);
      }
    }

    const newOrderItems = items.filter((item) => {
      const draftItem = item as Record<string, unknown>;
      return typeof draftItem.targetPedidoId !== "number" && !activePedido;
    });
    if (newOrderItems.length === 0) return;

    const creation: PendingOrderCreation = {
      solicitudId: crypto.randomUUID(),
      mesaId: observed.mesaId,
      atencionToken,
      observacion: typeof body.observacion === "string" ? body.observacion : null,
      items: newOrderItems.map((item) => {
        const draftItem = item as Record<string, unknown>;
        return { productoId: Number(draftItem.productoId), cantidad: Number(draftItem.cantidad),
          observacion: String(draftItem.observacion || "") };
      })
    };
    onCreating(creation);
    try {
      await api("/api/pedidos", { method: "POST", body: JSON.stringify(creation) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) onCreationConflict();
      throw error;
    }
  }

  function openCloseAccountDialog() {
    if (pendingClose) {
      setCloseAttention(pendingClose);
      setCloseError("El resultado del cobro sigue sin confirmar. Verificá antes de realizar otro cierre.");
      return;
    }
    if (!selectedMesa) return;
    if (!selectedMesa.atencionToken) {
      setMessage("La mesa no tiene una atención activa. Actualizá antes de cerrar la cuenta.");
      return;
    }
    if (consumoTotal <= 0) {
      setMessage("No hay consumos para cerrar en esta mesa");
      return;
    }
    if (pedidosPendientesDeEntrega.length > 0) {
      const estados = Array.from(new Set(pedidosPendientesDeEntrega.map((pedido) => pedido.estadoCocina))).join(", ");
      setMessage(`No se puede cerrar todavía: hay pedidos sin entregar (${estados}).`);
      return;
    }
    setCloseError("");
    setCloseConflict(false);
    setCloseAttention({ mesa: {
      id: selectedMesa.id, numero: selectedMesa.numero, descripcion: selectedMesa.descripcion,
      estado: selectedMesa.estado, atencionToken: selectedMesa.atencionToken
    }, items: cuentaDetalle, total: consumoTotal });
  }

  async function confirmCloseAccount(payment: { metodoPago: PaymentMethod; montoRecibido: number }) {
    if (!closeAttention || pendingClose || actionRunningRef.current) return;
    const snapshot: PendingAccountClose = { ...closeAttention,
      mesa: { id: closeAttention.mesa.id, numero: closeAttention.mesa.numero,
        descripcion: closeAttention.mesa.descripcion, estado: closeAttention.mesa.estado,
        atencionToken: closeAttention.mesa.atencionToken }, payment };
    try {
      savePendingAccountClose(window.sessionStorage, `bvm-pending-account-close:${user.id}`, snapshot);
    } catch {
      setCloseError("No se pudo guardar el cobro pendiente en esta pestaña. No se envió el cierre.");
      return;
    }
    setPendingClose(snapshot);
    try {
      actionRunningRef.current = true;
      localMutationVersionRef.current += 1;
      setClosingAccount(true);
      setCloseError("");
      setCloseConflict(false);
      setMessage("");
      const cuenta = await api("/api/cuentas", {
        method: "POST",
        body: JSON.stringify({ mesaId: snapshot.mesa.id, atencionToken: snapshot.mesa.atencionToken, ...payment })
      });
      savePendingAccountClose(window.sessionStorage, `bvm-pending-account-close:${user.id}`, null);
      setPendingClose(null);
      setCloseAttention(null);
      try {
        await loadAll();
        setMessage(`Cuenta #${cuenta.id} cerrada por ${money(cuenta.total)}.`);
      } catch {
        setMessage("Cuenta cerrada. No se pudo actualizar la vista; presioná Actualizar.");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        savePendingAccountClose(window.sessionStorage, `bvm-pending-account-close:${user.id}`, null);
        setPendingClose(null);
        setCloseError(error.message);
      } else {
        setCloseError("No se pudo confirmar el resultado del cobro. No vuelvas a cobrar; verificá el resultado de esta atención.");
        setCloseConflict(false);
      }
    } finally {
      setClosingAccount(false);
      actionRunningRef.current = false;
    }
  }

  async function verifyCloseResult() {
    if (!pendingClose || actionRunningRef.current) return;
    actionRunningRef.current = true;
    setVerifyingClose(true);
    setCloseError("");
    try {
      const result: { confirmado: boolean; mensaje?: string; cuenta?: { id: number; total: number; mesaNumero: number } } =
        await api(`/api/cuentas/resultado?atencionToken=${encodeURIComponent(pendingClose.mesa.atencionToken)}`);
      if (!result.confirmado || !result.cuenta) {
        setCloseError(result.mensaje || "No se encontró un cierre confirmado todavía. Verificá nuevamente antes de tomar otra decisión.");
        return;
      }
      savePendingAccountClose(window.sessionStorage, `bvm-pending-account-close:${user.id}`, null);
      setPendingClose(null);
      setCloseAttention(null);
      try {
        await loadAll();
        setMessage(`Cierre confirmado: Cuenta #${result.cuenta.id}, Mesa ${result.cuenta.mesaNumero}, ${money(result.cuenta.total)}.`);
      } catch {
        setMessage(`Cierre confirmado: Cuenta #${result.cuenta.id} por ${money(result.cuenta.total)}. No se pudo actualizar la vista; presioná Actualizar.`);
      }
    } catch {
      setCloseError("La consulta falló y el resultado sigue sin confirmar. Conservamos los datos; verificá nuevamente más tarde.");
    } finally {
      setVerifyingClose(false);
      actionRunningRef.current = false;
    }
  }

  function confirmDanger(action: ConfirmAction) {
    setConfirmAction(action);
  }

  async function updateKitchenStatus(pedidoId: number, estadoCocina: string, estadoCocinaEsperado: string,
    atencionToken: string | null, revisionContenidoEsperada?: number) {
    try {
      actionRunningRef.current = true;
      localMutationVersionRef.current += 1;
      setMessage("");
      const updated: Pedido = await api(`/api/pedidos/${pedidoId}`, { method: "PATCH",
        body: JSON.stringify({ estadoCocina, estadoCocinaEsperado, atencionToken, revisionContenidoEsperada }) });
      setAllPedidos((current) => current.map((pedido) => pedido.id === pedidoId ? updated : pedido));
      setPedidos((current) => current.map((pedido) => pedido.id === pedidoId ? updated : pedido));
      setMessage("Pedido actualizado");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await loadOperationalData().catch(() => {});
      }
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el pedido");
    } finally {
      actionRunningRef.current = false;
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    await run(action.onConfirm, action.confirmLabel);
  }

  function toggleProductStatus(producto: Producto) {
    const action = () =>
      api(`/api/products/${producto.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...producto, activo: !producto.activo, precio: Number(producto.precio), categoriaId: producto.categoriaId })
      });

    if (producto.activo && producto.visibleMenu) {
      confirmDanger({
        title: `Inactivar ${producto.nombre}`,
        message: "El producto dejara de poder cargarse en pedidos, aunque puede seguir existiendo en el historial. Revisá si tambien queres ocultarlo del menu desde Editar.",
        confirmLabel: "Estado actualizado",
        onConfirm: action
      });
      return;
    }

    run(action, "Estado actualizado");
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function changeOwnPassword(body: Record<string, unknown>) {
    try {
      setMessage("");
      await api("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      setShowSecurity(false);
      router.push("/login");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar la contraseña");
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Gestion Bodegon Villa Maria</h1>
          <p className="muted">
            {user.nombre} {user.apellido} · {user.role.nombre}
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setShowSecurity(true)}>
            <KeyRound size={17} /> Mi seguridad
          </button>
          <button className="btn" onClick={refreshAll} disabled={refreshing}>
            <RefreshCcw className={refreshing ? "spin-icon" : ""} size={17} /> Actualizar
          </button>
          <button className="btn danger" onClick={logout}>
            <LogOut size={17} /> Salir
          </button>
        </div>
      </header>

      <div className="tabs">
        {visibleTabs.map((tab) => (
          <button className={`tab ${active === tab ? "active" : ""}`} key={tab} onClick={() => setActive(tab)}>
            {tab}
          </button>
        ))}
      </div>
      {message && <p className={isErrorMessage(message) ? "error" : "notice"}>{message}</p>}
      {pendingClose && canManageOperaciones && (
        <div className="panel pending-close-notice" role="status">
          <div>
            <strong>Cobro pendiente de verificación · Mesa {pendingClose.mesa.numero}</strong>
            <p>Atención original: {pendingClose.mesa.atencionToken}. No vuelvas a cobrar hasta confirmar el resultado.</p>
            {closeError && !closeAttention && <p>{closeError}</p>}
          </div>
          <div className="actions">
            <button className="btn primary" type="button" disabled={verifyingClose || closingAccount} onClick={verifyCloseResult}>
              {verifyingClose ? "Verificando..." : "Verificar resultado del cobro"}
            </button>
            {!closeAttention && <button className="btn" type="button" onClick={() => setCloseAttention(pendingClose)}>Ver detalles</button>}
          </div>
        </div>
      )}

      {active === "Inicio" && canViewInicio && (
        <section className="dashboard-home">
          <div className="panel dashboard-hero">
            <div>
              <span className="auth-eyebrow">Resumen operativo</span>
              <h2>Hoy en Villa Maria</h2>
              <p className="muted">Estado general de ventas, mesas y actividad reciente del sistema.</p>
            </div>
            <div className="dashboard-hero-total">
              <span>Vendido hoy</span>
              <strong>{money(dashboardStats.ventasHoy)}</strong>
            </div>
          </div>

          <div className="stats-grid dashboard-stats">
            <Stat label="Mesas ocupadas" value={dashboardStats.mesasOcupadas} />
            <Stat label="Mesas libres" value={dashboardStats.mesasLibres} />
            <Stat label="Consumo abierto" value={money(dashboardStats.consumoAbierto)} />
            <Stat label="Cuentas cerradas" value={dashboardStats.cuentasHoy} />
            <Stat label="Ticket promedio" value={money(dashboardStats.ticketPromedio)} />
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Mesas en curso</h2>
                  <p className="muted">Consumos abiertos que necesitan seguimiento.</p>
                </div>
                {canManageOperaciones && (
                  <button className="btn" onClick={() => setActive("Operaciones")}>
                    <Table2 size={17} /> Ver operaciones
                  </button>
                )}
              </div>
              {activePedidosResumen.length === 0 ? (
                <p className="muted detail-empty">No hay mesas con pedidos activos.</p>
              ) : (
                <div className="open-table-list">
                  {activePedidosResumen.map((item) => (
                    <button
                      className="open-table-row"
                      key={item.mesa?.id || item.total}
                      type="button"
                      onClick={() => {
                        if (item.mesa?.id) selectMesa(item.mesa.id);
                        if (canManageOperaciones) setActive("Operaciones");
                      }}
                    >
                      <span>
                        <strong>{item.mesa ? `Mesa ${item.mesa.numero}` : "Mesa"}</strong>
                        <small>{item.items} items · {item.pedidos} pedidos</small>
                      </span>
                      <strong>{money(item.total)}</strong>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Actividad reciente</h2>
                  <p className="muted">Ultimos cierres registrados.</p>
                </div>
                {canViewHistory && (
                  <button className="btn" onClick={() => setActive("Historial")}>
                    <Receipt size={17} /> Ver historial
                  </button>
                )}
              </div>
              {cuentas.slice(0, 5).length === 0 ? (
                <p className="muted detail-empty">Todavia no hay cuentas cerradas.</p>
              ) : (
                <div className="recent-list">
                  {cuentas.slice(0, 5).map((cuenta) => (
                    <button className="recent-row" key={cuenta.id} type="button" onClick={() => setSelectedCuenta(cuenta)}>
                      <span>
                        <strong>Mesa {cuenta.mesa.numero}</strong>
                        <small>{new Date(cuenta.fechaCierre).toLocaleString("es-AR")} · {cuenta.metodoPago || "Efectivo"}</small>
                      </span>
                      <strong>{money(cuenta.total)}</strong>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Accesos rapidos</h2>
                <p className="muted">Entradas directas para las tareas mas frecuentes.</p>
              </div>
            </div>
            <div className="quick-actions">
              {canManageOperaciones && <button className="btn primary" onClick={() => setActive("Operaciones")}><Plus size={17} /> Cargar pedido</button>}
              {canManageCocina && <button className="btn" onClick={() => setActive("Cocina")}><ChefHat size={17} /> Ver cocina</button>}
              {canManageProducts && <button className="btn" onClick={() => setActive("Productos")}><Edit3 size={17} /> Editar productos</button>}
              {canViewReports && <button className="btn" onClick={() => setActive("Reportes")}><BarChart3 size={17} /> Ver reportes</button>}
              {canManageUsers && <button className="btn" onClick={() => setActive("Usuarios")}><KeyRound size={17} /> Gestionar usuarios</button>}
            </div>
          </section>
        </section>
      )}

      {active === "Operaciones" && canManageOperaciones && (
        <section className="workspace">
          <div className="panel">
            <div className="section-head">
              <div>
                <h2>Mesas</h2>
                <p className="muted">Selecciona una mesa para ver consumos, editarla y cargar pedidos.</p>
              </div>
              <MesaCreateForm
                nextMesaNumber={nextMesaNumber}
                onSubmit={(body) =>
                  run(async () => {
                    const existing = mesas.find((candidate) => candidate.numero === Number(body.numero));
                    const mesa = await api("/api/mesas", { method: "POST", body: JSON.stringify({
                      ...body,
                      ...(existing ? { revisionEsperada: existing.revision, atencionTokenEsperado: existing.atencionToken } : {})
                    }) });
                    setSelectedMesaId(mesa.id);
                    setPedidos([]);
                  }, "Mesa creada")
                }
              />
            </div>
            <div className="cards-grid">
              {mesas.filter((mesa) => mesa.activa).map((mesa) => {
                const mesaResumen = activePedidosByMesa.get(mesa.id);
                return (
                  <button className={`card table-card ${selectedMesa?.id === mesa.id ? "selected" : ""}`} key={mesa.id} onClick={() => selectMesa(mesa.id)}>
                    <div className="table-card-main">
                      <h3>Mesa {mesa.numero}</h3>
                      <p className={`status ${mesa.estado}`}>{mesa.estado}</p>
                      <p className="muted">{mesa.capacidad} personas · {mesa.descripcion || "Sin descripcion"}</p>
                    </div>
                    {mesaResumen?.listos ? (
                      <div className="table-ready-alert">
                        <ChefHat size={17} />
                        <strong>{mesaResumen.listos} pedido{mesaResumen.listos > 1 ? "s" : ""} listo{mesaResumen.listos > 1 ? "s" : ""} para retirar</strong>
                      </div>
                    ) : null}
                    {mesaResumen && (
                      <div className="table-partial">
                        <span>Consumo parcial</span>
                        <strong>{money(mesaResumen.total)}</strong>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <h2>{selectedMesa ? `Mesa ${selectedMesa.numero}` : "Mesa"}</h2>
            {selectedMesa ? (
              <>
                <p className={`status ${selectedMesa.estado}`}>{selectedMesa.estado}</p>
                <div className="actions">
                  {(selectedMesa.estadoPermitePedido ?? selectedMesa.estado === "Ocupada") ? (
                    <button
                      className="btn"
                      disabled={hayConsumosVigentes}
                      title={hayConsumosVigentes ? "Para liberar una mesa con consumos vigentes, cerrá la cuenta." : undefined}
                      onClick={() => run(() => api(`/api/mesas/${selectedMesa.id}`, { method: "PATCH", body: JSON.stringify({ estado: "Libre", revisionEsperada: selectedMesa.revision, atencionTokenEsperado: selectedMesa.atencionToken }) }), "Mesa liberada")}
                    >
                      Liberar
                    </button>
                  ) : (
                    <button className="btn" onClick={() => run(() => api(`/api/mesas/${selectedMesa.id}`, { method: "PATCH", body: JSON.stringify({ estado: "Ocupada", revisionEsperada: selectedMesa.revision, atencionTokenEsperado: selectedMesa.atencionToken }) }), "Mesa ocupada")}>
                      Ocupar
                    </button>
                  )}
                  <button
                    className="btn primary"
                    disabled={pedidosPendientesDeEntrega.length > 0}
                    title={pedidosPendientesDeEntrega.length > 0 ? "Para cerrar la cuenta, todos los pedidos tienen que estar entregados." : undefined}
                    onClick={openCloseAccountDialog}
                  >
                    <Receipt size={17} /> Cerrar cuenta
                  </button>
                  <button className="btn danger" onClick={() => confirmDanger({
                    title: `Dar de baja Mesa ${selectedMesa.numero}`,
                    message: "La mesa va a dejar de estar disponible para nuevas operaciones. Si tiene consumos activos, revisalos antes de continuar.",
                    confirmLabel: "Mesa dada de baja",
                    onConfirm: () => api(`/api/mesas/${selectedMesa.id}`, { method: "DELETE", body: JSON.stringify({ revisionEsperada: selectedMesa.revision, atencionTokenEsperado: selectedMesa.atencionToken }) })
                  })}>
                    <Trash2 size={17} /> Baja
                  </button>
                </div>
                {pedidosPendientesDeEntrega.length > 0 && (
                  <p className="muted">
                    Para cerrar la cuenta, primero marcá como entregados los pedidos pendientes.
                  </p>
                )}
                <CollapsibleSection title="Editar mesa">
                  <MesaEditForm key={selectedMesa.id} mesa={selectedMesa} onSubmit={(body) => run(() => api(`/api/mesas/${selectedMesa.id}`, { method: "PATCH", body: JSON.stringify(body) }), "Mesa modificada")} />
                </CollapsibleSection>
                <CollapsibleSection title="Agregar productos al consumo" defaultOpen>
                  <OrderForm key={selectedMesa.id} mesa={selectedMesa} storageKey={`bvm-order-draft:${user.id}:${selectedMesa.id}`} productos={productos.filter((p) => p.activo)} onSubmit={(body, observed, onOccupied, onItemAdded, onItemSending, onCreating, onCreationConflict) => run(() => addProductToMesa(body, observed, onOccupied, onItemAdded, onItemSending, onCreating, onCreationConflict), "Producto agregado al consumo").then((result) => result.ok)} />
                </CollapsibleSection>
                <h3>Consumo actual: {money(consumoTotal)}</h3>
                  <PedidoList pedidos={pedidosEnCurso} confirmDanger={confirmDanger} onKitchenStatusChange={updateKitchenStatus} />
              </>
            ) : (
              <p className="muted">Crea una mesa para empezar.</p>
            )}
          </div>
        </section>
      )}

      {active === "Cocina" && canManageCocina && (
        <section className="panel kitchen-board">
          <div className="section-head">
            <div>
              <h2><ChefHat size={24} /> Cocina</h2>
              <p className="muted">Pedidos activos organizados por mesa y estado de preparacion.</p>
            </div>
            <div className="preset-filter" aria-label="Filtro de pedidos">
              <button className={kitchenStatusFilter === "Activas" ? "active" : ""} type="button" onClick={() => setKitchenStatusFilter("Activas")}>Activas</button>
              {catalogs.cocinaEstados.map((estado) => (
                <button className={kitchenStatusFilter === estado.nombre ? "active" : ""} key={estado.codigo} type="button" onClick={() => setKitchenStatusFilter(estado.nombre)}>
                  {estado.nombre}
                </button>
              ))}
            </div>
          </div>

          {kitchenOrders.length === 0 ? (
            <p className="muted detail-empty">No hay pedidos para este filtro.</p>
          ) : (
            <div className="kitchen-grid">
              {kitchenOrders.map((pedido) => {
                const activeItems = pedido.items.filter((item) => !item.anulado);
                const totalItems = activeItems.reduce((sum, item) => sum + item.cantidad, 0);
                const currentIndex = catalogs.cocinaEstados.findIndex((estado) => estado.nombre === pedido.estadoCocina);
                const nextStatus = catalogs.cocinaEstados[Math.min(Math.max(currentIndex, 0) + 1, Math.max(catalogs.cocinaEstados.length - 1, 0))];
                const reviewedRevision = reviewedKitchenRevisions[pedido.id];
                const needsReview = reviewedRevision !== undefined && reviewedRevision !== pedido.revisionContenido;
                const readyBlocked = reviewedRevision === undefined || needsReview;

                return (
                  <article className="kitchen-ticket" key={pedido.id}>
                    <div className="kitchen-ticket-head">
                      <div>
                        <span className="auth-eyebrow">Pedido #{pedido.id}</span>
                        <h3>{pedido.mesa ? `Mesa ${pedido.mesa.numero}` : `Mesa ${pedido.mesaId}`}</h3>
                        <p className="muted">{new Date(pedido.fechaHora).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · {totalItems} items</p>
                      </div>
                      <span className={`status kitchen-${statusSlug(pedido.estadoCocina)}`}>{pedido.estadoCocina}</span>
                    </div>

                    <div className="kitchen-items">
                      {pedido.observacion && <p className="muted">Nota del pedido: {pedido.observacion}</p>}
                      {activeItems.map((item) => (
                        <div className="kitchen-item" key={item.id}>
                          <strong>{item.cantidad} x {item.producto.nombre}</strong>
                          {item.observacion && <small>{item.observacion}</small>}
                        </div>
                      ))}
                    </div>

                    {needsReview && (
                      <div className="kitchen-content-alert" role="alert">
                        <strong>El contenido de este pedido cambió.</strong>
                        <span>Revisá los productos y sus observaciones antes de marcarlo como listo.</span>
                        <div className="actions">
                          <button className="btn" type="button" onClick={() => loadOperationalData().catch(() => setMessage("No se pudo actualizar el pedido"))}>Actualizar pedido</button>
                          <button className="btn primary" type="button" onClick={() => setReviewedKitchenRevisions((current) => ({ ...current, [pedido.id]: pedido.revisionContenido }))}>Ya revisé los cambios</button>
                        </div>
                      </div>
                    )}

                    <div className="kitchen-actions">
                      {catalogs.cocinaEstados.map((estado) => (
                        <button
                          className={`btn ${pedido.estadoCocina === estado.nombre ? "primary" : ""}`}
                          disabled={pedido.estadoCocina === estado.nombre || (estado.nombre === "Listo" && readyBlocked)}
                          key={estado.codigo}
                          type="button"
                          onClick={() => updateKitchenStatus(pedido.id, estado.codigo, pedido.estadoCocinaCodigo || pedido.estadoCocina, pedido.atencionToken, estado.nombre === "Listo" ? reviewedRevision : undefined)}
                        >
                          {estado.nombre}
                        </button>
                      ))}
                    </div>

                    {nextStatus && pedido.estadoCocina !== nextStatus.nombre && nextStatus.visibleCocina && (
                      <button className="btn primary kitchen-next" type="button" disabled={nextStatus.nombre === "Listo" && readyBlocked} onClick={() => updateKitchenStatus(pedido.id, nextStatus.codigo, pedido.estadoCocinaCodigo || pedido.estadoCocina, pedido.atencionToken, nextStatus.nombre === "Listo" ? reviewedRevision : undefined)}>
                        Pasar a {nextStatus.nombre}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {active === "Productos" && canManageProducts && (
        <section className="workspace">
          <div className="panel">
            <div className="section-head">
              <div>
                <h2>Productos</h2>
                <p className="muted">Administra carta, precios, categorias y visibilidad del menu.</p>
              </div>
            </div>
            <div className="stats-grid compact-stats">
              <Stat label="Total productos" value={productStats.total} />
              <Stat label="Activos" value={productStats.activos} />
              <Stat label="Visibles en menu" value={productStats.visibles} />
              <Stat label="Categorias" value={productStats.categorias} />
            </div>
            <div className="product-filters">
              <label className="field search-field">
                Buscar
                <span>
                  <Search size={17} />
                  <input value={productSearch} placeholder="Nombre o descripcion" onChange={(event) => setProductSearch(event.target.value)} />
                </span>
              </label>
              <label className="field">
                Categoria
                <PrettySelect
                  value={productCategoryFilter}
                  onChange={(value) => setProductCategoryFilter(String(value))}
                  options={[{ value: "todas", label: "Todas" }, ...categorias.map((categoria) => ({ value: categoria.id, label: categoria.nombre }))]}
                />
              </label>
              <label className="field">
                Estado
                <PrettySelect
                  value={productStatusFilter}
                  onChange={(value) => setProductStatusFilter(String(value))}
                  options={[
                    { value: "todos", label: "Todos" },
                    { value: "activos", label: "Activos" },
                    { value: "inactivos", label: "Inactivos" }
                  ]}
                />
              </label>
              <label className="field">
                Menu
                <PrettySelect
                  value={productVisibilityFilter}
                  onChange={(value) => setProductVisibilityFilter(String(value))}
                  options={[
                    { value: "todos", label: "Todos" },
                    { value: "visibles", label: "Visible" },
                    { value: "ocultos", label: "Oculto" }
                  ]}
                />
              </label>
              <label className="field">
                Orden
                <PrettySelect
                  value={productSort}
                  onChange={(value) => setProductSort(String(value))}
                  options={[
                    { value: "nombre", label: "Nombre" },
                    { value: "categoria", label: "Categoria" },
                    { value: "precio", label: "Precio" },
                    { value: "estado", label: "Estado" }
                  ]}
                />
              </label>
              <button
                className="btn product-filter-reset"
                type="button"
                onClick={() => {
                  setProductSearch("");
                  setProductCategoryFilter("todas");
                  setProductStatusFilter("todos");
                  setProductVisibilityFilter("todos");
                  setProductSort("nombre");
                }}
              >
                Limpiar
              </button>
            </div>
            <table className="table">
              <thead><tr><th>Producto</th><th>Categoria</th><th>Precio</th><th>Estados</th><th></th></tr></thead>
              <tbody>
                {filteredProducts.map((producto) => (
                  <tr key={producto.id}>
                    <td><strong>{producto.nombre}</strong><br /><span className="muted">{producto.descripcion}</span></td>
                    <td><span className="pill">{producto.categoria.nombre}</span></td>
                    <td><strong>{money(producto.precio)}</strong></td>
                    <td className="product-badges">
                      <span className={`status ${producto.activo ? "Activo" : "Anulado"}`}>{producto.activo ? "Activo" : "Inactivo"}</span>
                      <span className={`status ${producto.visibleMenu ? "Activo" : "Cerrada"}`}>{producto.visibleMenu ? "Menu publico" : "Oculto"}</span>
                    </td>
                    <td className="actions">
                      <button className="btn" onClick={() => setEditingProduct(producto)}><Edit3 size={16} /></button>
                      <button className="btn" onClick={() => toggleProductStatus(producto)}>
                        {producto.activo ? "Inactivar" : "Activar"}
                      </button>
                      <button className="btn danger" onClick={() => confirmDanger({
                        title: `Eliminar ${producto.nombre}`,
                        message: "Si el producto tiene historial, se va a inactivar y ocultar del menu. Si no tiene historial, se elimina definitivamente.",
                        confirmLabel: "Producto eliminado o inactivado",
                        onConfirm: () => api(`/api/products/${producto.id}`, { method: "DELETE" })
                      })}>
                        <Trash2 size={16} /> Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={5} className="muted">No hay productos para los filtros seleccionados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <CollapsibleSection title={editingProduct ? `Editar ${editingProduct.nombre}` : "Nuevo producto"} defaultOpen>
              <ProductForm
                key={editingProduct?.id || "new-product"}
                categorias={categorias}
                product={editingProduct}
                onCancel={() => setEditingProduct(null)}
                onSubmit={(body) =>
                  run(
                    () => api(editingProduct ? `/api/products/${editingProduct.id}` : "/api/products", { method: editingProduct ? "PATCH" : "POST", body: JSON.stringify(body) }),
                    editingProduct ? "Producto modificado" : "Producto creado"
                  ).then(() => setEditingProduct(null))
                }
              />
            </CollapsibleSection>
            <CollapsibleSection title="Nueva categoria">
              <CategoryForm onSubmit={(body) => run(() => api("/api/categories", { method: "POST", body: JSON.stringify(body) }), "Categoria creada")} />
            </CollapsibleSection>
          </div>
        </section>
      )}

      {active === "Usuarios" && canManageUsers && (
        <section className="workspace">
          <div className="panel">
            <div className="section-head">
              <div>
                <h2>Usuarios</h2>
                <p className="muted">Administra accesos, roles y estado de las cuentas internas.</p>
              </div>
            </div>
            <div className="stats-grid compact-stats">
              <Stat label="Total usuarios" value={userStats.total} />
              <Stat label="Activos" value={userStats.activos} />
              <Stat label="Inactivos" value={userStats.inactivos} />
              <Stat label="Roles usados" value={userStats.rolesAsignados} />
            </div>
            <div className="product-filters">
              <label className="field search-field">
                Buscar
                <span>
                  <Search size={17} />
                  <input value={userSearch} placeholder="Nombre, usuario o email" onChange={(event) => setUserSearch(event.target.value)} />
                </span>
              </label>
              <label className="field">
                Rol
                <PrettySelect
                  value={userRoleFilter}
                  onChange={(value) => setUserRoleFilter(String(value))}
                  options={[{ value: "todos", label: "Todos" }, ...roles.map((role) => ({ value: role.id, label: role.nombre }))]}
                />
              </label>
              <label className="field">
                Estado
                <PrettySelect
                  value={userStatusFilter}
                  onChange={(value) => setUserStatusFilter(String(value))}
                  options={[
                    { value: "todos", label: "Todos" },
                    { value: "activos", label: "Activos" },
                    { value: "inactivos", label: "Inactivos" }
                  ]}
                />
              </label>
              <button
                className="btn product-filter-reset"
                type="button"
                onClick={() => {
                  setUserSearch("");
                  setUserRoleFilter("todos");
                  setUserStatusFilter("todos");
                }}
              >
                Limpiar
              </button>
            </div>
            <table className="table">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filteredUsers.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.nombre} {item.apellido}</strong><br />
                      <span className="muted">{item.usuario}{item.email ? ` · ${item.email}` : ""}</span>
                    </td>
                    <td><span className="pill">{item.role.nombre}</span></td>
                    <td><span className={`status ${item.estado ? "Activo" : "Anulado"}`}>{item.estado ? "Activo" : "Inactivo"}</span></td>
                    <td className="actions">
                      <button className="btn" onClick={() => setEditingUser(item)}><Edit3 size={16} /></button>
                      <button
                        className="btn danger"
                        disabled={item.id === user.id}
                        onClick={() => confirmDanger({
                          title: `Dar de baja ${item.usuario}`,
                          message: "El usuario no podra ingresar al sistema hasta que se lo reactive desde edicion.",
                          confirmLabel: "Usuario dado de baja",
                          onConfirm: () => api(`/api/users/${item.id}`, { method: "DELETE" })
                        })}
                      >
                        <Trash2 size={16} /> Baja
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={4} className="muted">No hay usuarios para los filtros seleccionados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <CollapsibleSection title={editingUser ? `Editar ${editingUser.usuario}` : "Nuevo usuario"} defaultOpen>
              <UserForm
                key={editingUser?.id || "new-user"}
                roles={roles}
                user={editingUser}
                onCancel={() => setEditingUser(null)}
                onSubmit={(body) =>
                  run(
                    () => api(editingUser ? `/api/users/${editingUser.id}` : "/api/users", { method: editingUser ? "PATCH" : "POST", body: JSON.stringify(body) }),
                    editingUser ? "Usuario modificado" : "Usuario creado"
                  ).then(() => setEditingUser(null))
                }
              />
            </CollapsibleSection>
          </div>
        </section>
      )}

      {active === "Reportes" && canViewReports && report && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2><BarChart3 size={24} /> Reportes</h2>
              <p className="muted">Ventas, cobros y rendimiento operativo del periodo seleccionado.</p>
              <p className="muted">Periodo: {new Date(report.from).toLocaleDateString("es-AR")} a {new Date(report.to).toLocaleDateString("es-AR")}</p>
            </div>
            <button className="btn" onClick={() => exportReport(report)}><Save size={17} /> CSV</button>
          </div>
          <div className="report-toolbar">
            <div className="preset-filter" aria-label="Rangos rapidos">
              <button type="button" onClick={() => applyReportPreset("today")}>Hoy</button>
              <button type="button" onClick={() => applyReportPreset("week")}>Ultimos 7 dias</button>
              <button type="button" onClick={() => applyReportPreset("month")}>Este mes</button>
            </div>
            <div className="report-dates">
              <Field label="Desde" type="date" value={reportFrom} onChange={setReportFrom} />
              <Field label="Hasta" type="date" value={reportTo} onChange={setReportTo} />
              <button className="btn primary" onClick={() => refreshReport()} disabled={refreshingReport}>
                <RefreshCcw className={refreshingReport ? "spin-icon" : ""} size={17} /> Actualizar
              </button>
            </div>
          </div>
          <div className="stats-grid">
            <Stat label="Total vendido" value={money(report.totalPeriodo)} />
            <Stat label="Cuentas cerradas" value={report.cuentasPeriodo} />
            <Stat label="Ticket promedio" value={money(report.cuentasPeriodo ? report.totalPeriodo / report.cuentasPeriodo : 0)} />
            <Stat label="Mesas atendidas" value={report.mesasAtendidasPeriodo} />
            <Stat label="Items anulados" value={report.pedidosAnulados} />
          </div>
          {report.cuentasPeriodo === 0 ? (
            <p className="muted report-empty">No hay cuentas cerradas en este periodo.</p>
          ) : (
            <div className="report-grid">
              <ReportBarList
                title="Productos mas vendidos"
                rows={report.productosMasVendidos.map((row) => ({
                  label: row.producto,
                  detail: `${row.cantidad} vendidos`,
                  value: row.total,
                  valueText: money(row.total)
                }))}
              />
              <ReportBarList
                title="Cobros por metodo de pago"
                rows={report.cobrosPorMetodo.map((row) => ({
                  label: row.metodo,
                  detail: `${row.cantidad} cuentas`,
                  value: row.total,
                  valueText: money(row.total)
                }))}
              />
            </div>
          )}
        </section>
      )}

      {active === "Historial" && canViewHistory && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Consumos historicos</h2>
              <p className="muted">Filtra por mesa o rango de fechas para controlar cierres anteriores.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              Mesa
              <PrettySelect
                value={historyMesaId}
                onChange={(value) => setHistoryMesaId(String(value))}
                options={[{ value: "", label: "Todas" }, ...mesas.map((mesa) => ({ value: mesa.id, label: `Mesa ${mesa.numero}` }))]}
              />
            </label>
            <Field label="Desde" type="date" value={historyFrom} onChange={setHistoryFrom} />
            <Field label="Hasta" type="date" value={historyTo} onChange={setHistoryTo} />
            <button className="btn primary" onClick={() => loadCuentas()}><RefreshCcw size={17} /> Filtrar</button>
            <button className="btn" onClick={() => exportHistory(cuentas)}><Save size={17} /> CSV</button>
          </div>
          <table className="table">
            <thead><tr><th>Fecha</th><th>Mesa</th><th>Usuario</th><th>Pago</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {cuentas.map((cuenta) => (
                <tr key={cuenta.id}>
                  <td>{new Date(cuenta.fechaCierre).toLocaleString("es-AR")}</td>
                  <td>Mesa {cuenta.mesa.numero}</td>
                  <td>{cuenta.usuarioCierre.nombre} {cuenta.usuarioCierre.apellido}</td>
                  <td>{cuenta.metodoPago || "Efectivo"}</td>
                  <td>{money(cuenta.total)}</td>
                  <td>
                    <button className="btn" type="button" onClick={() => setSelectedCuenta(cuenta)}>
                      <Receipt size={16} /> Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {closeAttention && (
        <CloseAccountDialog
          mesa={closeAttention.mesa}
          items={closeAttention.items}
          total={closeAttention.total}
          initialPayment={pendingClose?.payment}
          pending={Boolean(pendingClose)}
          verifying={verifyingClose}
          onVerify={verifyCloseResult}
          metodosPago={catalogs.metodosPago}
          error={closeError}
          conflict={closeConflict}
          submitting={closingAccount}
          onCancel={() => setCloseAttention(null)}
          onConfirm={confirmCloseAccount}
        />
      )}
      {selectedCuenta && <HistoryDetailDialog cuenta={selectedCuenta} onClose={() => setSelectedCuenta(null)} />}
      {showSecurity && (
        <SecurityDialog
          user={user}
          onCancel={() => setShowSecurity(false)}
          onSubmit={changeOwnPassword}
        />
      )}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          onCancel={() => setConfirmAction(null)}
          onConfirm={runConfirmedAction}
        />
      )}
    </main>
  );
}

function SecurityDialog({
  user,
  onCancel,
  onSubmit
}: {
  user: AuthUser;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void> | void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isValid = currentPassword.length > 0 && newPassword.length >= 8 && confirmPassword.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    await onSubmit({ currentPassword, newPassword, confirmPassword });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="security-title">
        <div className="security-mark">
          <KeyRound size={24} />
        </div>
        <h2 id="security-title">Mi seguridad</h2>
        <p className="muted">
          {user.nombre} {user.apellido} · {user.usuario}
        </p>
        <form className="form-grid security-form" onSubmit={submit}>
          <Field label="Contraseña actual" type="password" value={currentPassword} onChange={setCurrentPassword} wide />
          <Field label="Nueva contraseña" type="password" value={newPassword} onChange={setNewPassword} wide />
          <Field label="Confirmar nueva contraseña" type="password" value={confirmPassword} onChange={setConfirmPassword} wide />
          <p className="muted wide">Usá al menos 8 caracteres, con letras y numeros. Evitá claves demo como admin123.</p>
          <div className="actions modal-actions wide">
            <button className="btn" type="button" onClick={onCancel}>Cancelar</button>
            <button className="btn primary" disabled={!isValid} type="submit">
              <Save size={17} /> Cambiar contraseña
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MesaCreateForm({ nextMesaNumber, onSubmit }: { nextMesaNumber: number; onSubmit: (body: Record<string, unknown>) => void }) {
  const [numero, setNumero] = useState(String(nextMesaNumber));
  const [capacidad, setCapacidad] = useState(4);
  const [descripcion, setDescripcion] = useState("");
  useEffect(() => {
    setNumero(String(nextMesaNumber));
  }, [nextMesaNumber]);
  return (
    <form className="actions compact-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ numero: Number(numero), capacidad, descripcion: descripcion || `Mesa ${numero}` }); }}>
      <input aria-label="Numero de mesa" placeholder="Nro." value={numero} onChange={(event) => setNumero(event.target.value)} />
      <input aria-label="Capacidad" type="number" value={capacidad} onChange={(event) => setCapacidad(Number(event.target.value))} />
      <input aria-label="Descripcion" placeholder="Descripcion" value={descripcion} onChange={(event) => setDescripcion(event.target.value)} />
      <button className="btn"><Plus size={17} /> Agregar mesa</button>
    </form>
  );
}

function MesaEditForm({ mesa, onSubmit }: { mesa: Mesa; onSubmit: (body: Record<string, unknown>) => Promise<{ ok: true; value: Mesa } | { ok: false }> }) {
  const [body, setBody] = useState({ numero: mesa.numero, capacidad: mesa.capacidad, descripcion: mesa.descripcion || "" });
  const [observed, setObserved] = useState({ revisionEsperada: mesa.revision, atencionTokenEsperado: mesa.atencionToken });
  const newerVersion = mesa.revision > observed.revisionEsperada ||
    (mesa.revision === observed.revisionEsperada && observed.atencionTokenEsperado !== mesa.atencionToken);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onSubmit({ ...body, ...observed });
    if (result.ok) setObserved({ revisionEsperada: result.value.revision, atencionTokenEsperado: result.value.atencionToken });
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {newerVersion && <div className="field wide">
        <span>La mesa cambió mientras la editabas. Revisá la información antes de guardar.</span>
        <button type="button" className="btn" onClick={() => {
          setBody({ numero: mesa.numero, capacidad: mesa.capacidad, descripcion: mesa.descripcion || "" });
          setObserved({ revisionEsperada: mesa.revision, atencionTokenEsperado: mesa.atencionToken });
        }}>Cargar datos actuales</button>
      </div>}
      <Field label="Numero" type="number" value={body.numero} onChange={(numero) => setBody({ ...body, numero: Number(numero) })} />
      <Field label="Capacidad" type="number" value={body.capacidad} onChange={(capacidad) => setBody({ ...body, capacidad: Number(capacidad) })} />
      <Field label="Descripcion" value={body.descripcion} onChange={(descripcion) => setBody({ ...body, descripcion })} wide />
      <button className="btn primary wide"><Save size={17} /> Guardar mesa</button>
    </form>
  );
}

function ProductForm({ categorias, product, onCancel, onSubmit }: { categorias: Categoria[]; product: Producto | null; onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> | void }) {
  const initialProductBody = () => ({
    nombre: product?.nombre || "",
    descripcion: product?.descripcion || "",
    precio: Number(product?.precio || 0),
    categoriaId: product?.categoriaId || categorias[0]?.id || 0,
    activo: product?.activo ?? true,
    visibleMenu: product?.visibleMenu ?? true
  });
  const emptyProductBody = () => ({
    nombre: "",
    descripcion: "",
    precio: 0,
    categoriaId: categorias[0]?.id || 0,
    activo: true,
    visibleMenu: true
  });
  const [body, setBody] = useState(initialProductBody);
  const isValid = body.nombre.trim().length > 0 && Number(body.precio) > 0 && Boolean(body.categoriaId || categorias[0]?.id);

  useEffect(() => {
    setBody(initialProductBody());
  }, [product, categorias]);

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    await onSubmit({ ...body, categoriaId: body.categoriaId || categorias[0]?.id, nombre: body.nombre.trim() });
    if (!product) setBody(emptyProductBody());
  }

  return (
    <form className="form-grid" onSubmit={submitProduct}>
      <Field label="Nombre" value={body.nombre} onChange={(nombre) => setBody({ ...body, nombre })} />
      <Field label="Precio" type="number" value={body.precio} onChange={(precio) => setBody({ ...body, precio: Number(precio) })} />
      <label className="field wide">
        Categoria
        <PrettySelect
          value={body.categoriaId}
          onChange={(value) => setBody({ ...body, categoriaId: Number(value) })}
          options={categorias.map((cat) => ({ value: cat.id, label: cat.nombre }))}
        />
      </label>
      <Field label="Descripcion" value={body.descripcion} onChange={(descripcion) => setBody({ ...body, descripcion })} wide />
      <label className="check"><input type="checkbox" checked={body.activo} onChange={(event) => setBody({ ...body, activo: event.target.checked })} /> Activo</label>
      <label className="check"><input type="checkbox" checked={body.visibleMenu} onChange={(event) => setBody({ ...body, visibleMenu: event.target.checked })} /> Visible en menu</label>
      {!isValid && <p className="error wide">Nombre, precio mayor a cero y categoria son obligatorios.</p>}
      <button className="btn primary wide" disabled={!isValid}><Save size={17} /> {product ? "Guardar cambios" : "Guardar producto"}</button>
      {product && <button className="btn wide" type="button" onClick={onCancel}>Cancelar edicion</button>}
    </form>
  );
}

function CategoryForm({ onSubmit }: { onSubmit: (body: Record<string, unknown>) => void }) {
  const [nombre, setNombre] = useState("");
  return (
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (!nombre.trim()) return; onSubmit({ nombre: nombre.trim(), visible: true }); setNombre(""); }}>
      <Field label="Nombre" value={nombre} onChange={setNombre} wide />
      <button className="btn primary wide" disabled={!nombre.trim()}>Guardar categoria</button>
    </form>
  );
}

function UserForm({ roles, user, onCancel, onSubmit }: { roles: Role[]; user: User | null; onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> | void }) {
  const initialUserBody = () => ({
    nombre: user?.nombre || "",
    apellido: user?.apellido || "",
    usuario: user?.usuario || "",
    password: "",
    email: user?.email || "",
    telefono: user?.telefono || "",
    roleId: user?.role?.id || roles[0]?.id || 0,
    estado: user?.estado ?? true
  });
  const emptyUserBody = () => ({
    nombre: "",
    apellido: "",
    usuario: "",
    password: "",
    email: "",
    telefono: "",
    roleId: roles[0]?.id || 0,
    estado: true
  });
  const [body, setBody] = useState(initialUserBody);
  const emailValido = !body.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email);
  const isValid =
    body.nombre.trim().length > 0 &&
    body.apellido.trim().length > 0 &&
    body.usuario.trim().length > 0 &&
    Boolean(body.roleId || roles[0]?.id) &&
    (Boolean(user) || body.password.trim().length > 0) &&
    emailValido;

  useEffect(() => {
    setBody(initialUserBody());
  }, [user, roles]);

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    await onSubmit({
      ...body,
      nombre: body.nombre.trim(),
      apellido: body.apellido.trim(),
      usuario: body.usuario.trim(),
      email: body.email.trim(),
      telefono: body.telefono.trim(),
      roleId: body.roleId || roles[0]?.id
    });
    if (!user) setBody(emptyUserBody());
  }

  return (
    <form className="form-grid" onSubmit={submitUser}>
      <Field label="Nombre" value={body.nombre} onChange={(nombre) => setBody({ ...body, nombre })} />
      <Field label="Apellido" value={body.apellido} onChange={(apellido) => setBody({ ...body, apellido })} />
      <Field label="Usuario" value={body.usuario} onChange={(usuario) => setBody({ ...body, usuario })} />
      <Field label={user ? "Nueva contraseña opcional" : "Contraseña"} type="password" value={body.password} onChange={(password) => setBody({ ...body, password })} />
      <Field label="Email" value={body.email} onChange={(email) => setBody({ ...body, email })} />
      <Field label="Telefono" value={body.telefono} onChange={(telefono) => setBody({ ...body, telefono })} />
      <label className="field">
        Rol
        <PrettySelect
          value={body.roleId}
          onChange={(value) => setBody({ ...body, roleId: Number(value) })}
          options={roles.map((role) => ({ value: role.id, label: role.nombre }))}
        />
      </label>
      <label className="check"><input type="checkbox" checked={body.estado} onChange={(event) => setBody({ ...body, estado: event.target.checked })} /> Activo</label>
      {!isValid && <p className="error wide">Nombre, apellido, usuario, rol y contraseña al crear son obligatorios. Si cargás email, debe ser válido.</p>}
      <button className="btn primary wide" disabled={!isValid}>{user ? "Guardar cambios" : "Crear usuario"}</button>
      {user && <button className="btn wide" type="button" onClick={onCancel}>Cancelar edicion</button>}
    </form>
  );
}

function OrderForm({ mesa, productos, storageKey, onSubmit }: {
  mesa: Mesa;
  productos: Producto[];
  storageKey: string;
  onSubmit: (body: Record<string, unknown>, observed: OrderAttention,
    onOccupied: (attention: OrderAttention) => void, onItemAdded: (draftId: string) => void,
    onItemSending: (draftId: string, pedidoId: number) => void,
    onCreating: (creation: PendingOrderCreation) => void,
    onCreationConflict: () => void) => Promise<boolean> | boolean;
}) {
  const [productoId, setProductoId] = useState(productos[0]?.id || 0);
  const [cantidad, setCantidad] = useState(1);
  const [categoriaId, setCategoriaId] = useState("todas");
  const [query, setQuery] = useState("");
  const [observacion, setObservacion] = useState("");
  const [draftItems, setDraftItems] = useState<OrderDraftItem[]>([]);
  const [draftAttention, setDraftAttention] = useState<OrderAttention | null>(null);
  const [pendingCreation, setPendingCreation] = useState<PendingOrderCreation | null>(null);
  const [creationConflict, setCreationConflict] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftStorageError, setDraftStorageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      const restored = readPendingOrderDraft(window.sessionStorage.getItem(storageKey), mesa.id);
      if (restored) {
        setDraftItems(restored.items);
        setDraftAttention(restored.attention);
        setPendingCreation(restored.creation);
      }
    } catch {
      setDraftStorageError(true);
    } finally {
      setDraftRestored(true);
    }
  }, [mesa.id, storageKey]);

  useEffect(() => {
    if (!draftRestored) return;
    try {
      savePendingOrderDraft(window.sessionStorage, storageKey, draftAttention, draftItems, pendingCreation);
      setDraftStorageError(false);
    } catch {
      setDraftStorageError(true);
    }
  }, [draftAttention, draftItems, draftRestored, pendingCreation, storageKey]);

  function persistDraft(attention: OrderAttention | null, items: OrderDraftItem[], creation: PendingOrderCreation | null) {
    try {
      savePendingOrderDraft(window.sessionStorage, storageKey, attention, items, creation);
      setDraftStorageError(false);
    } catch {
      setDraftStorageError(true);
      throw new Error("No se pudo conservar el borrador en esta pestaña. Revisá el estado antes de reintentar.");
    }
  }
  const categorias = useMemo(() => {
    const map = new Map<number, Categoria>();
    productos.forEach((producto) => map.set(producto.categoria.id, producto.categoria));
    return Array.from(map.values()).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre));
  }, [productos]);
  const productosFiltrados = useMemo(() => {
    const term = query.trim().toLowerCase();
    return productos.filter((producto) => {
      const matchesCategory = categoriaId === "todas" || producto.categoriaId === Number(categoriaId);
      const matchesQuery = !term || `${producto.nombre} ${producto.descripcion || ""}`.toLowerCase().includes(term);
      return matchesCategory && matchesQuery;
    });
  }, [categoriaId, productos, query]);
  const selectedProduct = productosFiltrados.find((producto) => producto.id === productoId) || productosFiltrados[0] || productos.find((producto) => producto.id === productoId) || productos[0];
  const safeCantidad = Math.max(1, Number(cantidad) || 1);
  const draftTotal = draftItems.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

  useEffect(() => {
    if (!selectedProduct && productos[0]) {
      setProductoId(productos[0].id);
      return;
    }
    if (selectedProduct && selectedProduct.id !== productoId) {
      setProductoId(selectedProduct.id);
    }
  }, [productoId, productos, selectedProduct]);

  function addDraftItem() {
    if (!draftRestored || submittingRef.current || pendingCreation || !selectedProduct) return;
    if (!draftAttention) setDraftAttention({
      mesaId: mesa.id,
      revision: mesa.revision,
      atencionToken: mesa.atencionToken,
      occupied: mesa.estadoPermitePedido ?? mesa.estado === "Ocupada"
    });
    const solicitudId = crypto.randomUUID();
    setDraftItems((current) => [
      ...current,
      {
        draftId: solicitudId,
        solicitudId,
        targetPedidoId: null,
        productoId: selectedProduct.id,
        nombre: selectedProduct.nombre,
        cantidad: safeCantidad,
        precio: Number(selectedProduct.precio),
        observacion
      }
    ]);
    setCantidad(1);
    setObservacion("");
  }

  function removeDraftItem(draftId: string) {
    if (submittingRef.current || pendingCreation) return;
    setDraftItems((current) => current.filter((item) => item.draftId !== draftId));
    if (draftItems.length === 1) setDraftAttention(null);
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftRestored || submittingRef.current) return;
    if (draftItems.length === 0 && !pendingCreation) {
      addDraftItem();
      return;
    }
    if (!draftAttention) return;
    let pendingItems = draftItems.map((item) => ({ ...item }));
    let attention = draftAttention;
    let creation = pendingCreation;
    try {
      persistDraft(attention, pendingItems, creation);
    } catch {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await onSubmit({ items: pendingItems, pendingCreation: creation }, draftAttention, (nextAttention) => {
        attention = nextAttention;
        setDraftAttention(nextAttention);
        persistDraft(attention, pendingItems, creation);
      }, (draftId) => {
        pendingItems = pendingItems.filter((item) => item.draftId !== draftId);
        setDraftItems(pendingItems);
        persistDraft(attention, pendingItems, creation);
      }, (draftId, pedidoId) => {
        pendingItems = pendingItems.map((item) => item.draftId === draftId ? { ...item, targetPedidoId: pedidoId } : item);
        setDraftItems(pendingItems);
        persistDraft(attention, pendingItems, creation);
      }, (nextCreation) => {
        creation = nextCreation;
        setPendingCreation(nextCreation);
        persistDraft(attention, pendingItems, creation);
      }, () => {
        setCreationConflict(true);
      });
      if (!saved) return;
      setDraftItems([]);
      setDraftAttention(null);
      setPendingCreation(null);
      setCreationConflict(false);
      persistDraft(null, [], null);
      setCantidad(1);
      setObservacion("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const attentionChanged = Boolean(draftAttention && (
    draftAttention.occupied
      ? mesa.atencionToken !== draftAttention.atencionToken
      : mesa.revision !== draftAttention.revision || (mesa.estadoPermitePedido ?? mesa.estado === "Ocupada")
  ));

  return (
    <form className="form-grid" onFocusCapture={() => {
      if (!draftRestored) return;
      if (!draftAttention) setDraftAttention({
        mesaId: mesa.id,
        revision: mesa.revision,
        atencionToken: mesa.atencionToken,
        occupied: mesa.estadoPermitePedido ?? mesa.estado === "Ocupada"
      });
    }} onSubmit={submitOrder}>
      {attentionChanged && <p className="error wide">La atención cambió mientras preparabas el pedido. Este borrador no se enviará a la atención nueva.</p>}
      {pendingCreation && <p className="muted wide">Pedido pendiente de confirmación. Reenviá para recuperar el resultado antes de modificar este borrador.</p>}
      {pendingCreation && creationConflict && <button className="btn wide" type="button" disabled={submitting} onClick={() => {
        if (!window.confirm("Revisá primero si el pedido aparece en la mesa. ¿Querés descartar la solicitud pendiente y conservar los productos para revisarlos?")) return;
        try {
          persistDraft(draftAttention, draftItems, null);
        } catch {
          return;
        }
        setPendingCreation(null);
        setCreationConflict(false);
      }}>Descartar solicitud en conflicto</button>}
      {draftStorageError && <p className="error wide">El navegador no permitió guardar el borrador en esta pestaña. Revisá su configuración antes de enviar.</p>}
      <label className="field wide search-field">
        Buscar producto
        <span>
          <Search size={17} />
          <input value={query} placeholder="Nombre o descripcion" onChange={(event) => setQuery(event.target.value)} />
        </span>
      </label>

      <div className="category-filter wide" aria-label="Categorias">
        {categorias.map((categoria) => (
          <button className={categoriaId === String(categoria.id) ? "active" : ""} key={categoria.id} type="button" onClick={() => setCategoriaId(String(categoria.id))}>
            {categoria.nombre}
          </button>
        ))}
        <button className={categoriaId === "todas" ? "active" : ""} type="button" onClick={() => setCategoriaId("todas")}>Todas</button>
      </div>

      <div className="product-picker wide">
        {productosFiltrados.length === 0 && <p className="muted">No hay productos que coincidan con la busqueda.</p>}
        {productosFiltrados.map((producto) => (
          <button
            className={`product-option ${selectedProduct?.id === producto.id ? "selected" : ""}`}
            key={producto.id}
            type="button"
            onClick={() => setProductoId(producto.id)}
          >
            <span>
              <strong>{producto.nombre}</strong>
              <small>{producto.categoria.nombre}</small>
            </span>
            <strong>{money(producto.precio)}</strong>
          </button>
        ))}
      </div>

      <div className="quantity-control">
        <span>Cantidad</span>
        <div>
          <button className="btn" type="button" onClick={() => setCantidad(Math.max(1, safeCantidad - 1))} aria-label="Restar cantidad">
            <Minus size={16} />
          </button>
          <input aria-label="Cantidad" min={1} type="number" value={cantidad} onChange={(event) => setCantidad(Math.max(1, Number(event.target.value) || 1))} />
          <button className="btn" type="button" onClick={() => setCantidad(safeCantidad + 1)} aria-label="Sumar cantidad">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <Field label="Observacion" value={observacion} onChange={setObservacion} />
      <div className="order-preview wide">
        <span>{selectedProduct ? `${safeCantidad} x ${selectedProduct.nombre}` : "Sin producto seleccionado"}</span>
        <strong>{selectedProduct ? money(Number(selectedProduct.precio) * safeCantidad) : money(0)}</strong>
      </div>
      <button className="btn wide" type="button" disabled={!draftRestored || submitting || Boolean(pendingCreation) || !selectedProduct || productos.length === 0} onClick={addDraftItem}>
        <Plus size={17} /> Agregar al pedido
      </button>

      <div className="draft-order wide">
        <div className="draft-order-head">
          <strong>Pedido a enviar</strong>
          <span>{draftItems.length} producto{draftItems.length === 1 ? "" : "s"}</span>
        </div>
        {draftItems.length === 0 ? (
          <p className="muted">Agrega uno o mas productos antes de enviar a cocina.</p>
        ) : (
          <div className="draft-order-list">
            {draftItems.map((item) => (
              <div className="draft-order-item" key={item.draftId}>
                <span>
                  <strong>{item.cantidad} x {item.nombre}</strong>
                  {item.observacion && <small>{item.observacion}</small>}
                </span>
                <div className="actions">
                  <strong>{money(item.precio * item.cantidad)}</strong>
                  <button className="btn danger" type="button" disabled={submitting || Boolean(pendingCreation)} onClick={() => removeDraftItem(item.draftId)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="draft-order-total">
          <span>Total pedido</span>
          <strong>{money(draftTotal)}</strong>
        </div>
      </div>
      <button className="btn primary wide" disabled={!draftRestored || submitting || draftItems.length === 0}><Plus size={17} /> Enviar pedido</button>
    </form>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="collapsible" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <ChevronDown size={18} />
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}

function CloseAccountDialog({
  mesa,
  items,
  total,
  initialPayment,
  pending,
  verifying,
  onVerify,
  metodosPago,
  error,
  conflict,
  submitting,
  onCancel,
  onConfirm
}: {
  mesa: PendingAccountClose["mesa"];
  items: CuentaDetalleItem[];
  total: number;
  initialPayment?: PendingAccountClose["payment"];
  pending: boolean;
  verifying: boolean;
  onVerify: () => void;
  metodosPago: MetodoPago[];
  error: string;
  conflict: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (payment: { metodoPago: PaymentMethod; montoRecibido: number }) => void;
}) {
  const defaultMetodo = metodosPago[0]?.nombre || "Efectivo";
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>(initialPayment?.metodoPago || defaultMetodo);
  const [montoRecibido, setMontoRecibido] = useState(initialPayment?.montoRecibido ?? total);
  const selectedMetodo = metodosPago.find((metodo) => metodo.nombre === metodoPago || metodo.codigo === metodoPago);
  const requiereMontoRecibido = selectedMetodo?.requiereMontoRecibido ?? metodoPago === "Efectivo";
  const efectivoInsuficiente = requiereMontoRecibido && montoRecibido < total;
  const importeCobrado = requiereMontoRecibido ? montoRecibido : total;
  const vuelto = requiereMontoRecibido ? Math.max(0, montoRecibido - total) : 0;

  useEffect(() => {
    if (!pending && !requiereMontoRecibido) {
      setMontoRecibido(total);
    }
  }, [pending, requiereMontoRecibido, total]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="close-account-title">
        <div className="section-head">
          <div>
            <h2 id="close-account-title">Detalle de cuenta</h2>
            <p className="muted">Mesa {mesa.numero} · {mesa.descripcion || "Sin descripcion"}</p>
          </div>
          <span className={`status ${mesa.estado}`}>{mesa.estado}</span>
        </div>

        <table className="table compact-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.producto}</strong>
                  {item.observacion && <p className="muted">{item.observacion}</p>}
                </td>
                <td>{item.cantidad}</td>
                <td>{money(item.precioUnitario)}</td>
                <td>{money(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="account-total">
          <span>Total a cobrar</span>
          <strong>{money(total)}</strong>
        </div>

        <fieldset className="payment-box" disabled={pending || submitting}>
          <label className="field wide">
            Metodo de pago
            <PrettySelect
              value={metodoPago}
              onChange={(value) => setMetodoPago(String(value) as PaymentMethod)}
              options={(metodosPago.length ? metodosPago : [{ id: 0, codigo: "PAGO_EFECTIVO", nombre: "Efectivo", requiereMontoRecibido: true }]).map((metodo) => ({ value: metodo.nombre, label: metodo.nombre }))}
            />
          </label>

          {requiereMontoRecibido ? (
            <Field label="Monto recibido" type="number" value={montoRecibido} onChange={(value) => setMontoRecibido(Number(value) || 0)} wide />
          ) : (
            <div className="payment-note">
              <span>Importe cobrado</span>
              <strong>{money(total)}</strong>
            </div>
          )}

          <div className="payment-summary">
            <span>Metodo: <strong>{metodoPago}</strong></span>
            <span>Recibido: <strong>{money(importeCobrado)}</strong></span>
            <span>Vuelto: <strong>{money(vuelto)}</strong></span>
          </div>
          {efectivoInsuficiente && <p className="error">El monto recibido no puede ser menor al total.</p>}
          {error && <p className="error" role="alert">{error}{conflict ? " Cerrá este formulario y actualizá la información antes de volver a cobrar." : ""}</p>}
        </fieldset>
        <div className="actions modal-actions">
          <button className="btn" type="button" disabled={submitting} onClick={onCancel}>{pending ? "Cerrar" : "Cancelar"}</button>
          {pending ? (
            <button className="btn primary" type="button" disabled={verifying || submitting} onClick={onVerify}>
              {verifying ? "Verificando..." : "Verificar resultado del cobro"}
            </button>
          ) : (
            <button className="btn primary" type="button" disabled={efectivoInsuficiente || submitting || conflict} onClick={() => onConfirm({ metodoPago, montoRecibido: importeCobrado })}>
              <Receipt size={17} /> Confirmar cierre
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryDetailDialog({ cuenta, onClose }: { cuenta: Cuenta; onClose: () => void }) {
  const items = parseCuentaDetalle(cuenta.detalleJson);
  const total = Number(cuenta.total);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="history-detail-title">
        <div className="section-head">
          <div>
            <h2 id="history-detail-title">Cuenta #{cuenta.id}</h2>
            <p className="muted">
              Mesa {cuenta.mesa.numero} · {new Date(cuenta.fechaCierre).toLocaleString("es-AR")}
            </p>
            <p className="muted">
              Cerrada por {cuenta.usuarioCierre.nombre} {cuenta.usuarioCierre.apellido}
            </p>
          </div>
          <span className="status Cerrada">Cerrada</span>
        </div>

        {items.length > 0 ? (
          <table className="table compact-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.pedidoId}-${item.producto}-${index}`}>
                  <td>
                    <strong>{item.producto}</strong>
                    {item.observacion && <p className="muted">{item.observacion}</p>}
                  </td>
                  <td>{item.cantidad}</td>
                  <td>{money(item.precioUnitario)}</td>
                  <td>{money(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted detail-empty">No hay detalle disponible para esta cuenta.</p>
        )}

        <div className="account-total">
          <span>Total cobrado</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="payment-summary history-payment">
          <span>Metodo: <strong>{cuenta.metodoPago || "Efectivo"}</strong></span>
          <span>Recibido: <strong>{money(cuenta.montoRecibido || cuenta.total)}</strong></span>
          <span>Vuelto: <strong>{money(cuenta.vuelto || 0)}</strong></span>
        </div>
        <div className="actions modal-actions">
          <button className="btn primary" type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDialog({ action, onCancel, onConfirm }: { action: ConfirmAction; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="danger-mark">
          <Trash2 size={22} />
        </div>
        <h2 id="confirm-title">{action.title}</h2>
        <p className="muted">{action.message}</p>
        <div className="actions modal-actions">
          <button className="btn" type="button" onClick={onCancel}>Cancelar</button>
          <button className="btn danger" type="button" onClick={onConfirm}>
            <Trash2 size={17} /> Confirmar
          </button>
        </div>
      </section>
    </div>
  );
}

function ReportBarList({
  title,
  rows
}: {
  title: string;
  rows: Array<{ label: string; detail: string; value: number; valueText: string }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <section className="report-card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">Sin datos para mostrar.</p>
      ) : (
        <div className="report-bars">
          {rows.map((row) => (
            <div className="report-row" key={row.label}>
              <div>
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </div>
              <div className="report-bar-track" aria-hidden="true">
                <span style={{ width: `${Math.max(8, (row.value / max) * 100)}%` }} />
              </div>
              <strong>{row.valueText}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PedidoList({
  pedidos,
  confirmDanger,
  onKitchenStatusChange
}: {
  pedidos: Pedido[];
  confirmDanger: (action: ConfirmAction) => void;
  onKitchenStatusChange: (pedidoId: number, estadoCocina: string, estadoCocinaEsperado: string, atencionToken: string | null) => Promise<void>;
}) {
  return (
    <div>
      {pedidos.length === 0 && <p className="muted">No hay pedido en curso para esta mesa.</p>}
      {pedidos.map((pedido) => (
        <div className="card" key={pedido.id}>
          <div className="pedido-head">
            <div>
              <strong>Pedido #{pedido.id}</strong>{" "}
              <span className={`status ${pedido.estado}`}>{pedido.estado}</span>{" "}
              <span className={`status kitchen-${statusSlug(pedido.estadoCocina)}`}>{pedido.estadoCocina}</span>
            </div>
            {pedido.estadoCocina === "Listo" && (
              <button className="btn primary" type="button" onClick={() => onKitchenStatusChange(pedido.id, "Entregado", pedido.estadoCocinaCodigo || pedido.estadoCocina, pedido.atencionToken)}>
                <ChefHat size={16} /> Marcar entregado
              </button>
            )}
          </div>
          {pedido.estadoCocina === "Listo" && (
            <div className="pedido-ready-alert">
              <ChefHat size={18} />
              <strong>Listo para retirar por cocina</strong>
            </div>
          )}
          {pedido.items.map((item) => (
            <div className="menu-item" key={item.id}>
              <div>
                <strong>{item.cantidad} x {item.producto.nombre}</strong>
                <p className="muted">{item.anulado ? `Anulado: ${item.motivoAnulacion || ""}` : item.observacion}</p>
              </div>
              <div className="actions">
                <strong>{money(item.subtotal)}</strong>
                {!item.anulado && (pedido.estadoActivo ?? pedido.estado === "Activo") && (
                  <button className="btn danger" onClick={() => confirmDanger({
                    title: `Anular ${item.producto.nombre}`,
                    message: `Se va a anular ${item.cantidad} x ${item.producto.nombre} del pedido #${pedido.id}. El movimiento queda registrado como correccion de pedido.`,
                    confirmLabel: "Item anulado",
                    onConfirm: () => api(`/api/pedidos/items/${item.id}`, { method: "DELETE", body: JSON.stringify({ motivo: "Correccion de pedido", atencionToken: pedido.atencionToken }) })
                  })}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", wide = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PrettySelect({
  value,
  options,
  onChange,
  placeholder = "Seleccionar"
}: {
  value: string | number;
  options: SelectOption[];
  onChange: (value: string | number) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div className="pretty-select" ref={rootRef}>
      <button
        aria-expanded={open}
        className={`pretty-select-trigger ${open ? "open" : ""}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || placeholder}</span>
        <ChevronDown size={17} />
      </button>
      {open && (
        <div className="pretty-select-menu" role="listbox">
          {options.map((option) => {
            const active = String(option.value) === String(value);
            return (
              <button
                className={`pretty-select-option ${active ? "active" : ""}`}
                key={`${option.value}`}
                role="option"
                aria-selected={active}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function isErrorMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("error") || lower.includes("rechazada") || lower.includes("no se pudo") || lower.includes("ingresá");
}

function statusSlug(status: string) {
  return status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
}

function parseCuentaDetalle(value: string): CuentaDetalleItem[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: Number(item.id || 0),
        pedidoId: Number(item.pedidoId || 0),
        producto: String(item.producto || item.productoNombre || "Producto"),
        cantidad: Number(item.cantidad || 0),
        precioUnitario: Number(item.precioUnitario || 0),
        subtotal: Number(item.subtotal || 0),
        observacion: typeof item.observacion === "string" ? item.observacion : null
      }))
      .filter((item) => item.cantidad > 0 && item.subtotal >= 0);
  } catch {
    return [];
  }
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function exportReport(report: Report) {
  const rows = [
    ["Reporte desde", new Date(report.from).toLocaleDateString("es-AR")],
    ["Reporte hasta", new Date(report.to).toLocaleDateString("es-AR")],
    ["Total vendido", report.totalPeriodo],
    ["Cuentas cerradas", report.cuentasPeriodo],
    ["Ticket promedio", report.cuentasPeriodo ? report.totalPeriodo / report.cuentasPeriodo : 0],
    ["Mesas atendidas", report.mesasAtendidasPeriodo],
    ["Items anulados", report.pedidosAnulados],
    [],
    ["Cobros por metodo"],
    ["Metodo", "Cuentas", "Total"],
    ...report.cobrosPorMetodo.map((row) => [row.metodo, row.cantidad, row.total]),
    [],
    ["Productos mas vendidos"],
    ["Producto", "Cantidad", "Total"],
    ...report.productosMasVendidos.map((row) => [row.producto, row.cantidad, row.total])
  ];
  downloadCsv("reporte-ventas.csv", rows);
}

function exportHistory(cuentas: Cuenta[]) {
  const rows = [
    ["Fecha", "Mesa", "Usuario", "Metodo", "Total"],
    ...cuentas.map((cuenta) => [
      new Date(cuenta.fechaCierre).toLocaleString("es-AR"),
      `Mesa ${cuenta.mesa.numero}`,
      `${cuenta.usuarioCierre.nombre} ${cuenta.usuarioCierre.apellido}`,
      cuenta.metodoPago || "Efectivo",
      cuenta.total
    ])
  ];
  downloadCsv("historial-consumos.csv", rows);
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
