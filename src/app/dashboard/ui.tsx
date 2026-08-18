"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronDown, Edit3, KeyRound, LogOut, Minus, Plus, Receipt, RefreshCcw, Save, Search, Trash2 } from "lucide-react";
import { money } from "@/lib/money";

type Role = { id: number; nombre: string };
type AuthUser = { id: number; nombre: string; apellido: string; usuario: string; email?: string | null; role: { nombre: string } };
type User = { id: number; nombre: string; apellido: string; usuario: string; email?: string | null; telefono?: string | null; estado: boolean; roleId?: number; role: Role };
type Mesa = { id: number; numero: number; descripcion?: string | null; capacidad: number; estado: string; activa: boolean };
type Categoria = { id: number; nombre: string; orden?: number | null; visible: boolean };
type Producto = { id: number; nombre: string; descripcion?: string | null; precio: string; activo: boolean; visibleMenu: boolean; categoriaId: number; categoria: Categoria };
type PedidoItem = { id: number; productoId: number; cantidad: number; precioUnitario: string; subtotal: string; observacion?: string | null; anulado: boolean; motivoAnulacion?: string | null; producto: Producto };
type Pedido = { id: number; mesaId: number; estado: string; observacion?: string | null; fechaHora: string; items: PedidoItem[] };
type PaymentMethod = "Efectivo" | "Debito" | "Credito" | "Transferencia";
type Cuenta = { id: number; fechaCierre: string; total: string; metodoPago: PaymentMethod; montoRecibido: string; vuelto: string; detalleJson: string; mesa: Mesa; usuarioCierre: { nombre: string; apellido: string; usuario: string } };
type CuentaDetalleItem = { id: number; pedidoId: number; producto: string; cantidad: number; precioUnitario: number; subtotal: number; observacion?: string | null };
type Report = { from: string; to: string; totalDia: number; totalPeriodo: number; cuentasHoy: number; cuentasPeriodo: number; mesasOcupadas: number; mesasAtendidasHoy: number; mesasAtendidasPeriodo: number; pedidosAnulados: number; cobrosPorMetodo: Array<{ metodo: string; cantidad: number; total: number }>; productosMasVendidos: Array<{ producto: string; cantidad: number; total: number }> };
type ConfirmAction = { title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> };

const tabs = ["Operaciones", "Productos", "Usuarios", "Reportes", "Historial"];
const employeeTabs = ["Operaciones", "Productos"];

async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Operacion rechazada");
  return data;
}

export default function DashboardClient({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [active, setActive] = useState("Operaciones");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
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
  const [historyMesaId, setHistoryMesaId] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [showCloseAccount, setShowCloseAccount] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [message, setMessage] = useState("");
  const isAdmin = user.role.nombre === "Administrador";

  const selectedMesa = mesas.find((mesa) => mesa.id === selectedMesaId) || mesas[0] || null;
  const nextMesaNumber = useMemo(
    () => Math.max(0, ...mesas.map((mesa) => mesa.numero)) + 1,
    [mesas]
  );
  const pedidosEnCurso = useMemo(
    () => pedidos.filter((pedido) => pedido.estado === "Activo"),
    [pedidos]
  );
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
      administradores: users.filter((item) => item.role.nombre === "Administrador").length,
      empleados: users.filter((item) => item.role.nombre === "Empleado").length
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

  async function applyReportPreset(preset: "today" | "week" | "month") {
    const today = new Date();
    const from = new Date(today);
    if (preset === "week") from.setDate(today.getDate() - 6);
    if (preset === "month") from.setDate(1);
    const fromText = toDateInput(from);
    const toText = toDateInput(today);
    setReportFrom(fromText);
    setReportTo(toText);
    await loadReport(fromText, toText);
  }

  async function loadAll() {
    const [mesasData, categoriasData, productosData] = await Promise.all([
      api("/api/mesas"),
      api("/api/categories"),
      api("/api/products")
    ]);
    setMesas(mesasData);
    setCategorias(categoriasData);
    setProductos(productosData);
    if (isAdmin) {
      const [rolesData, usersData, reportData] = await Promise.all([
        api("/api/roles"),
        api("/api/users"),
        api("/api/reports")
      ]);
      setRoles(rolesData);
      setUsers(usersData);
      setReport(reportData);
      await loadCuentas();
    }
    const mesaId = selectedMesaId || mesasData[0]?.id;
    setSelectedMesaId(mesaId || null);
    if (mesaId) setPedidos(await api(`/api/pedidos?mesaId=${mesaId}`));
  }

  useEffect(() => {
    loadAll().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!isAdmin && !employeeTabs.includes(active)) {
      setActive("Operaciones");
    }
  }, [active, isAdmin]);

  async function run(action: () => Promise<unknown>, ok = "Operacion realizada") {
    try {
      setMessage("");
      await action();
      setMessage(ok);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    }
  }

  async function selectMesa(id: number) {
    setSelectedMesaId(id);
    setPedidos(await api(`/api/pedidos?mesaId=${id}`));
  }

  async function addProductToMesa(body: Record<string, unknown>) {
    if (!selectedMesa) throw new Error("Selecciona una mesa");
    const item = Array.isArray(body.items) ? body.items[0] : null;
    if (!item || !(item as { productoId?: unknown }).productoId) {
      throw new Error("Selecciona un producto");
    }

    if (selectedMesa.estado !== "Ocupada") {
      await api(`/api/mesas/${selectedMesa.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "Ocupada" })
      });
    }

    const activePedido = pedidos.find((pedido) => pedido.estado === "Activo");
    if (activePedido) {
      await api(`/api/pedidos/${activePedido.id}/items`, {
        method: "POST",
        body: JSON.stringify(item)
      });
      return;
    }

    await api("/api/pedidos", {
      method: "POST",
      body: JSON.stringify({ ...body, mesaId: selectedMesa.id })
    });
  }

  function openCloseAccountDialog() {
    if (!selectedMesa) return;
    if (consumoTotal <= 0) {
      setMessage("No hay consumos para cerrar en esta mesa");
      return;
    }
    setShowCloseAccount(true);
  }

  function confirmDanger(action: ConfirmAction) {
    setConfirmAction(action);
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
          <button className="btn" onClick={() => loadAll()}>
            <RefreshCcw size={17} /> Actualizar
          </button>
          <button className="btn danger" onClick={logout}>
            <LogOut size={17} /> Salir
          </button>
        </div>
      </header>

      <div className="tabs">
        {(isAdmin ? tabs : employeeTabs).map((tab) => (
          <button className={`tab ${active === tab ? "active" : ""}`} key={tab} onClick={() => setActive(tab)}>
            {tab}
          </button>
        ))}
      </div>
      {message && <p className={isErrorMessage(message) ? "error" : "notice"}>{message}</p>}

      {active === "Operaciones" && (
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
                    const mesa = await api("/api/mesas", { method: "POST", body: JSON.stringify(body) });
                    setSelectedMesaId(mesa.id);
                    setPedidos([]);
                  }, "Mesa creada")
                }
              />
            </div>
            <div className="cards-grid">
              {mesas.filter((mesa) => mesa.activa).map((mesa) => (
                <button className={`card ${selectedMesa?.id === mesa.id ? "selected" : ""}`} key={mesa.id} onClick={() => selectMesa(mesa.id)}>
                  <h3>Mesa {mesa.numero}</h3>
                  <p className={`status ${mesa.estado}`}>{mesa.estado}</p>
                  <p className="muted">{mesa.capacidad} personas · {mesa.descripcion || "Sin descripcion"}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{selectedMesa ? `Mesa ${selectedMesa.numero}` : "Mesa"}</h2>
            {selectedMesa ? (
              <>
                <p className={`status ${selectedMesa.estado}`}>{selectedMesa.estado}</p>
                <div className="actions">
                  <button className="btn" onClick={() => run(() => api(`/api/mesas/${selectedMesa.id}`, { method: "PATCH", body: JSON.stringify({ estado: "Ocupada" }) }), "Mesa ocupada")}>
                    Ocupar
                  </button>
                  <button className="btn primary" onClick={openCloseAccountDialog}>
                    <Receipt size={17} /> Cerrar cuenta
                  </button>
                  <button className="btn danger" onClick={() => confirmDanger({
                    title: `Dar de baja Mesa ${selectedMesa.numero}`,
                    message: "La mesa va a dejar de estar disponible para nuevas operaciones. Si tiene consumos activos, revisalos antes de continuar.",
                    confirmLabel: "Mesa dada de baja",
                    onConfirm: () => api(`/api/mesas/${selectedMesa.id}`, { method: "DELETE" })
                  })}>
                    <Trash2 size={17} /> Baja
                  </button>
                </div>
                <CollapsibleSection title="Editar mesa">
                  <MesaEditForm mesa={selectedMesa} onSubmit={(body) => run(() => api(`/api/mesas/${selectedMesa.id}`, { method: "PATCH", body: JSON.stringify(body) }), "Mesa modificada")} />
                </CollapsibleSection>
                <CollapsibleSection title="Agregar productos al consumo" defaultOpen>
                  <OrderForm productos={productos.filter((p) => p.activo)} onSubmit={(body) => run(() => addProductToMesa(body), "Producto agregado al consumo")} />
                </CollapsibleSection>
                <h3>Consumo actual: {money(consumoTotal)}</h3>
                  <PedidoList pedidos={pedidosEnCurso} confirmDanger={confirmDanger} />
              </>
            ) : (
              <p className="muted">Crea una mesa para empezar.</p>
            )}
          </div>
        </section>
      )}

      {active === "Productos" && (
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
                <select value={productCategoryFilter} onChange={(event) => setProductCategoryFilter(event.target.value)}>
                  <option value="todas">Todas</option>
                  {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
                </select>
              </label>
              <label className="field">
                Estado
                <select value={productStatusFilter} onChange={(event) => setProductStatusFilter(event.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="activos">Activos</option>
                  <option value="inactivos">Inactivos</option>
                </select>
              </label>
              <label className="field">
                Menu
                <select value={productVisibilityFilter} onChange={(event) => setProductVisibilityFilter(event.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="visibles">Visible</option>
                  <option value="ocultos">Oculto</option>
                </select>
              </label>
              <label className="field">
                Orden
                <select value={productSort} onChange={(event) => setProductSort(event.target.value)}>
                  <option value="nombre">Nombre</option>
                  <option value="categoria">Categoria</option>
                  <option value="precio">Precio</option>
                  <option value="estado">Estado</option>
                </select>
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

      {active === "Usuarios" && isAdmin && (
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
              <Stat label="Administradores" value={userStats.administradores} />
              <Stat label="Empleados" value={userStats.empleados} />
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
                <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)}>
                  <option value="todos">Todos</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}
                </select>
              </label>
              <label className="field">
                Estado
                <select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="activos">Activos</option>
                  <option value="inactivos">Inactivos</option>
                </select>
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

      {active === "Reportes" && report && (
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
              <button className="btn primary" onClick={() => loadReport()}><RefreshCcw size={17} /> Actualizar</button>
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

      {active === "Historial" && (
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
              <select value={historyMesaId} onChange={(event) => setHistoryMesaId(event.target.value)}>
                <option value="">Todas</option>
                {mesas.map((mesa) => <option value={mesa.id} key={mesa.id}>Mesa {mesa.numero}</option>)}
              </select>
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
      {showCloseAccount && selectedMesa && (
        <CloseAccountDialog
          mesa={selectedMesa}
          items={cuentaDetalle}
          total={consumoTotal}
          onCancel={() => setShowCloseAccount(false)}
          onConfirm={(payment) =>
            run(async () => {
              await api("/api/cuentas", { method: "POST", body: JSON.stringify({ mesaId: selectedMesa.id, ...payment }) });
              setShowCloseAccount(false);
            }, "Cuenta cerrada")
          }
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

function MesaEditForm({ mesa, onSubmit }: { mesa: Mesa; onSubmit: (body: Record<string, unknown>) => void }) {
  const [body, setBody] = useState({ numero: mesa.numero, capacidad: mesa.capacidad, descripcion: mesa.descripcion || "" });
  useEffect(() => {
    setBody({ numero: mesa.numero, capacidad: mesa.capacidad, descripcion: mesa.descripcion || "" });
  }, [mesa]);

  return (
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(body); }}>
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
        <select value={body.categoriaId} onChange={(e) => setBody({ ...body, categoriaId: Number(e.target.value) })}>
          {categorias.map((cat) => <option value={cat.id} key={cat.id}>{cat.nombre}</option>)}
        </select>
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
        <select value={body.roleId} onChange={(e) => setBody({ ...body, roleId: Number(e.target.value) })}>
          {roles.map((role) => <option value={role.id} key={role.id}>{role.nombre}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={body.estado} onChange={(event) => setBody({ ...body, estado: event.target.checked })} /> Activo</label>
      {!isValid && <p className="error wide">Nombre, apellido, usuario, rol y contraseña al crear son obligatorios. Si cargás email, debe ser válido.</p>}
      <button className="btn primary wide" disabled={!isValid}>{user ? "Guardar cambios" : "Crear usuario"}</button>
      {user && <button className="btn wide" type="button" onClick={onCancel}>Cancelar edicion</button>}
    </form>
  );
}

function OrderForm({ productos, onSubmit }: { productos: Producto[]; onSubmit: (body: Record<string, unknown>) => void }) {
  const [productoId, setProductoId] = useState(productos[0]?.id || 0);
  const [cantidad, setCantidad] = useState(1);
  const [categoriaId, setCategoriaId] = useState("todas");
  const [query, setQuery] = useState("");
  const [observacion, setObservacion] = useState("");
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

  useEffect(() => {
    if (!selectedProduct && productos[0]) {
      setProductoId(productos[0].id);
      return;
    }
    if (selectedProduct && selectedProduct.id !== productoId) {
      setProductoId(selectedProduct.id);
    }
  }, [productoId, productos, selectedProduct]);

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;
    onSubmit({ items: [{ productoId: selectedProduct.id, cantidad: safeCantidad, observacion }] });
    setCantidad(1);
    setObservacion("");
  }

  return (
    <form className="form-grid" onSubmit={submitOrder}>
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
      <button className="btn primary wide" disabled={!selectedProduct || productos.length === 0}><Plus size={17} /> Agregar al consumo</button>
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
  onCancel,
  onConfirm
}: {
  mesa: Mesa;
  items: CuentaDetalleItem[];
  total: number;
  onCancel: () => void;
  onConfirm: (payment: { metodoPago: PaymentMethod; montoRecibido: number }) => void;
}) {
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>("Efectivo");
  const [montoRecibido, setMontoRecibido] = useState(total);
  const efectivoInsuficiente = metodoPago === "Efectivo" && montoRecibido < total;
  const importeCobrado = metodoPago === "Efectivo" ? montoRecibido : total;
  const vuelto = metodoPago === "Efectivo" ? Math.max(0, montoRecibido - total) : 0;

  useEffect(() => {
    if (metodoPago !== "Efectivo") {
      setMontoRecibido(total);
    }
  }, [metodoPago, total]);

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

        <div className="payment-box">
          <label className="field wide">
            Metodo de pago
            <select value={metodoPago} onChange={(event) => setMetodoPago(event.target.value as PaymentMethod)}>
              <option value="Efectivo">Efectivo</option>
              <option value="Debito">Debito</option>
              <option value="Credito">Credito</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </label>

          {metodoPago === "Efectivo" ? (
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
        </div>
        <div className="actions modal-actions">
          <button className="btn" type="button" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" type="button" disabled={efectivoInsuficiente} onClick={() => onConfirm({ metodoPago, montoRecibido: importeCobrado })}>
            <Receipt size={17} /> Confirmar cierre
          </button>
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

function PedidoList({ pedidos, confirmDanger }: { pedidos: Pedido[]; confirmDanger: (action: ConfirmAction) => void }) {
  return (
    <div>
      {pedidos.length === 0 && <p className="muted">No hay pedido en curso para esta mesa.</p>}
      {pedidos.map((pedido) => (
        <div className="card" key={pedido.id}>
          <strong>Pedido #{pedido.id}</strong> <span className={`status ${pedido.estado}`}>{pedido.estado}</span>
          {pedido.items.map((item) => (
            <div className="menu-item" key={item.id}>
              <div>
                <strong>{item.cantidad} x {item.producto.nombre}</strong>
                <p className="muted">{item.anulado ? `Anulado: ${item.motivoAnulacion || ""}` : item.observacion}</p>
              </div>
              <div className="actions">
                <strong>{money(item.subtotal)}</strong>
                {!item.anulado && pedido.estado === "Activo" && (
                  <button className="btn danger" onClick={() => confirmDanger({
                    title: `Anular ${item.producto.nombre}`,
                    message: `Se va a anular ${item.cantidad} x ${item.producto.nombre} del pedido #${pedido.id}. El movimiento queda registrado como correccion de pedido.`,
                    confirmLabel: "Item anulado",
                    onConfirm: () => api(`/api/pedidos/items/${item.id}`, { method: "DELETE", body: JSON.stringify({ motivo: "Correccion de pedido" }) })
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function isErrorMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("error") || lower.includes("rechazada") || lower.includes("no se pudo") || lower.includes("ingresá");
}

function parseCuentaDetalle(value: string): CuentaDetalleItem[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: Number(item.id || 0),
        pedidoId: Number(item.pedidoId || 0),
        producto: String(item.producto || "Producto"),
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
